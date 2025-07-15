export async function shortenHTML(page, html, extraTagsToRemove = [], classesToRemove = [], lengthLimit = 100_000) {
    const pageOrigin = new URL(page.url()).origin;
    return await page.evaluate((html, extraTagsToRemove, classesToRemove, pageOrigin, lengthLimit) => {
        const root = document.createElement('div');
        root.innerHTML = html || document.documentElement.outerHTML;

        const removeTags = (root, tags) => {
            for (const tag of tags) {
                const elements = root.querySelectorAll(tag);
                for (const el of elements) {
                    el.remove();
                }
            }
        };

        const removeEmptyElements = (root) => {
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                if (!el.textContent.trim()) el.remove();
            }
        };

        const removeComments = (root) => {
            const iterator = document.createNodeIterator(root, NodeFilter.SHOW_COMMENT, null, false);
            let currentNode;
            while (currentNode = iterator.nextNode()) {
                currentNode.remove();
            }
        };

        const keepAttributes = (root, attributesToKeep) => {
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                for (const attr of [...el.attributes]) {
                    if (!attributesToKeep.includes(attr.name)) {
                        el.removeAttribute(attr.name);
                    }
                }
            }
        };

        const removeConsecutiveParagraphs = (root) => {
            const paragraphs = root.querySelectorAll('p');
            for (let i = 1; i < paragraphs.length; i++) {
                if (paragraphs[i].previousElementSibling?.tagName === 'P') {
                    paragraphs[i].remove();
                }
            }
        };

        const flattenDOM = (root) => {
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                if (el.tagName === 'A') continue;

                const parent = el.parentElement;
                if (parent && parent.childElementCount === 1 && !['HTML', 'HEAD', 'BODY'].includes(parent.tagName)) {
                    while (el.firstChild) {
                        parent.insertBefore(el.firstChild, el);
                    }
                    el.remove();
                }
            }
        };

        const removeEmptyContainers = (root) => {
            const elements = root.querySelectorAll('div, section, span');
            for (const el of elements) {
                if (!el.textContent.trim() && el.children.length === 0) {
                    el.remove();
                }
            }
        };

        const truncateLongTextInAllElements = (root, lengthLimit) => {
            const truncateTextNode = (node) => {
                const textContent = node.nodeValue.trim();
                if (textContent.length > lengthLimit) {
                    node.nodeValue = textContent.slice(0, lengthLimit);
                }
            };

            const traverseAndTruncate = (element) => {
                const children = Array.from(element.childNodes);
                for (const child of children) {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        traverseAndTruncate(child);
                    } else if (child.nodeType === Node.TEXT_NODE) {
                        truncateTextNode(child);
                    }
                }

                if (!element.textContent.trim() && element.nodeName !== 'BODY') {
                    element.remove();
                }
            };

            traverseAndTruncate(root);
        };

        const truncateAttributes = (root, attributesToShorten, lengthLimit) => {
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                for (const attrName of attributesToShorten) {
                    if (el.hasAttribute(attrName)) {
                        const attrValue = el.getAttribute(attrName);
                        if (attrValue.length > lengthLimit) {
                            el.setAttribute(attrName, attrValue.slice(0, lengthLimit));
                        }
                    }
                }
            }
        };

        // Removes baseUrl(origin) from hrefs
        const stripDomainFromLinks = (root) => {
            try {
                const links = root.querySelectorAll("a[href]");
                for (const link of links) {
                    const href = link.getAttribute("href");
                    if (!href) return;

                    const url = new URL(href, pageOrigin);
                    if (url.origin === pageOrigin) {
                        const shortenedHref = url.pathname + url.search + url.hash;
                        link.setAttribute("href", shortenedHref);
                    }
                    else {
                        link.remove();
                    }
                }
            } catch (error) {
                console.error("MY: Error stripping domain from links:", error);
            }
        };

        const removeElementsByClassSubstring = (root, substring, caseSensitive) => {
            const elements = caseSensitive
                ? root.querySelectorAll(`[class*='${substring}']`)
                : root.querySelectorAll(`[class*='${substring}' i]`);

            for (const el of elements) {
                el.remove();
            }
        };

        try {
            removeComments(root);
            removeConsecutiveParagraphs(root);
            keepAttributes(root, ['class', 'id', 'href', 'value']);
            truncateLongTextInAllElements(root, 50);
            removeEmptyElements(root);
            removeEmptyContainers(root);
            removeElementsByClassSubstring(root, 'cookie', false);

            removeTags(root, [
                'head', 'style', 'meta', 'link', 'iframe', 'object',
                'embed', 'noscript', 'img', 'svg', 'canvas',
                'footer',
                'blockquote', 'br', 'hr',
                'script'
            ]);
        } catch(err) {
            console.error("Error while shortening HTML", ex);
        }

        if (root.outerHTML.replace(/\s+/g, ' ').trim().length > 150_000) {
            console.log("MY: flattening DOM, length: ", root.outerHTML.replace(/\s+/g, ' ').trim().length);
            flattenDOM(root);

            removeTags(root, extraTagsToRemove);

            for (const classToRemove of classesToRemove) {
                removeElementsByClassSubstring(root, classToRemove, true);
            }
        }

        if (root.outerHTML.replace(/\s+/g, ' ').trim().length > lengthLimit) {
            truncateAttributes(root, ['class', 'id', 'value'], 40);

            stripDomainFromLinks(root);
            return root.outerHTML.replace(/\s+/g, ' ').trim().substring(0, lengthLimit)
        }

        return root.outerHTML.replace(/\s+/g, ' ').trim();
    }, html, extraTagsToRemove, classesToRemove, pageOrigin, lengthLimit);
}

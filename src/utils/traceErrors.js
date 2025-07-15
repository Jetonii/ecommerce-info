export function removeErrorListeners(page) {
    page.removeAllListeners('console');
    page.removeAllListeners('requestfailed');
    page.removeAllListeners('response');
}

export async function traceErrors(page, report) {
    const httpErrorCodes = ["400", "401", "403", "404", "500", "502", "503", "504"];

    page.on('console', async (msg) => {
        if (msg.text().startsWith("SourceCodeError")) {
            const stackTrace = msg.text().split("SourceCodeError, ")[1].trim();

            report.sourceCodeErrors[stackTrace] = (report.sourceCodeErrors[stackTrace] || 0) + 1;
            return;
        }
    });

    page.on('requestfailed', (request) => {
        const resourceType = request.resourceType();
        const errorMessage = request.failure()?.errorText || 'Unknown error';

        if (resourceType === 'xhr' || resourceType === 'fetch') {
            report.apiErrors[errorMessage] = (report.apiErrors[errorMessage] || 0) + 1;
        } else if (resourceType === 'image') {
            report.imageErrors[errorMessage] = (report.imageErrors[errorMessage] || 0) + 1;
        }
    });

    page.on('response', async response => {
        const status = response.status().toString();
        if (!response.ok() && httpErrorCodes.includes(status)) {
            const statusText = response.statusText() || status;

            report.apiErrors[statusText] = (report.apiErrors[statusText] || 0) + 1;
        }
    });

    await page.evaluateOnNewDocument(() => {
        // Source Code Errors
        window.addEventListener("error", function (event) {
            try {
                let stacktrace = event.stack;
                if (!stacktrace && event.error) {
                    stacktrace = event.error.stack;
                }
                if (event.returnValue === true) {
                    if (!stacktrace) {
                        stacktrace = event.message;
                    }
                    if (!stacktrace.includes("Script error.") &&
                        !stacktrace.includes("undefined (reading 'left')")) {
                        console.log(`SourceCodeError, ${stacktrace}`);
                    }
                }
            } catch (e) {
                console.error("Error in error listener:", e);
            }
        });
    });
}


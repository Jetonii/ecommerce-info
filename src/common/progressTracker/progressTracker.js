export default class ProgressTracker {
    constructor({ totalEstimatedDuration, tableName, docId, socket }) {
        this.tableName = tableName;
        this.docId = docId;
        this.progress = 0;
        this.totalEstimatedDuration = totalEstimatedDuration;
        this.socket = socket;
        this.updateInterval = null;
        this.currentTarget = 0;
    }

    async startStep(stepPercentage) {
        await this._completePreviousStep();
        const stepDuration = this.totalEstimatedDuration * (stepPercentage / 100);
        const increment = (stepPercentage / stepDuration) * 5; // 5 should be the same as interval
        const currentTarget = this.progress + stepPercentage;
        this.currentTarget = Math.min(99, currentTarget); // 100 is achieved only on finalize

        this.updateInterval = setInterval(async () => {
            if (this.progress + increment < this.currentTarget) {
                this.progress += increment;
                await this.emitProgress();
            } else {
                await this._completePreviousStep(); // Clean up and emit final progress for this step
            }
        }, 5000);
    }

    async _completePreviousStep() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.progress < this.currentTarget) {
            this.progress = this.currentTarget;
            await this.emitProgress();
        }
    }

    async finalize() {
        await this._completePreviousStep();
        if (this.progress < 100) {
            this.progress = 100;
            await this.emitProgress();
        }
    }

    async emitProgress() {
        try {
            this.socket.emit('progress', Math.round(this.progress));
        } catch (err) {
            console.error(`Error emitting progress:`, err);
        }
    }

    // async emitProgress() {
    //     try {
    //         // Todo: use sockets instead
    //         await updateById(this.tableName, this.docId, { $set: { processPercentage: Math.round(this.progress) } });
    //     } catch (err) {
    //         console.error(`Error updating progress in MongoDB:`, err);
    //     }
    // }
}



// export default class ProgressTracker {
//     constructor(socket) {
//         this.progress = 0;
//         this.stepWeight = 0;
//         this.targetWeight = 0;
//         this.updateInterval = null;
//         this.socket = socket;
//     }

//     startTask(stepWeight, taskDurationSeconds) {
//         this.stepWeight = stepWeight;
//         this.targetWeight = this.progress + stepWeight;

//         if (this.updateInterval) {
//             clearInterval(this.updateInterval);
//         }

//         const incrementPerUpdate = stepWeight / taskDurationSeconds;

//         this.updateInterval = setInterval(() => {
//             if (this.progress + incrementPerUpdate < this.targetWeight) {
//                 this.progress += incrementPerUpdate;
//                 this.emitProgress();
//             }
//         }, 1000);
//     }

//     completeTask() {
//         this.progress = this.targetWeight;
//         this.emitProgress();

//         if (this.updateInterval) {
//             clearInterval(this.updateInterval);
//             this.updateInterval = null;
//         }
//     }

//     emitProgress() {
//         try {
//             this.socket.emit('progress', Math.round(this.progress));
//         } catch (err) {
//             console.error(`Error emitting progress:`, err);
//         }
//     }
// }

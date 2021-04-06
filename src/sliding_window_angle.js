const SlidingWindow = require("./sliding_window");

class SlidingWindowAngle {
    constructor(maxlen) {
        this.eastWindow  = new SlidingWindow(maxlen)
        this.northWindow = new SlidingWindow(maxlen)
    }

    clear() {
        this.eastWindow.clear()
        this.northWindow.clear()
    }

    append(v) {
        this.eastWindow.append(Math.cos(v))
        this.northWindow.append(Math.sin(v))
    }

    isFull() {
        return this.eastWindow.isFull()
    }

    get_avg() {
        const eastSum = this.eastWindow.get_sum();
        const northSum = this.northWindow.get_sum();
        return  Math.atan2(northSum, eastSum)
    }
}

module.exports = SlidingWindowAngle


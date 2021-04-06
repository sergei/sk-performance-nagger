class SlidingWindow {
    constructor(maxlen) {
        this.maxlen = maxlen
        this.q = []
        this.sum = 0
    }

    clear() {
        this.q = []
        this.sum = 0
    }

    append(v) {
        let old_v;
        if (this.q.length < this.maxlen) {
            old_v = 0
        } else {
            old_v = this.q.shift()
        }
        this.sum -= old_v
        this.q.push(v)
        this.sum += v
    }

    len() {
        return this.q.length
    }

    get_avg() {
        return this.sum / this.q.length
    }

    get_sum() {
        return this.sum
    }

    sum_halves(splitPoint = null) {
        splitPoint = splitPoint === null ? this.maxlen / 2 : splitPoint
        const sumBefore = this.q.slice(0, splitPoint).reduce((a, b) => a + b, 0)
        const sumAfter = this.q.slice(splitPoint - 1).reduce((a, b) => a + b, 0)
        return [sumBefore, sumAfter]
    }

    isFull() {
        return this.q.length === this.maxlen
    }
}

module.exports = SlidingWindow


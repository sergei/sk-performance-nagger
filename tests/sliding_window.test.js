const SlidingWindow = require('../src/sliding_window')

test('Sliding window sum', () => {
    const win = new SlidingWindow(10);

    let expectedSum = 0
    // Just a regular sun until is full
    for(let i= 0; i < 10; i++){
        win.append(i+1);
        expectedSum += i+1;
        expect(win.get_sum()).toBe(expectedSum)
        expect(win.get_avg()).toBe(expectedSum / (i+1))
    }
    expect(win.isFull()).toBeTruthy()

    // The first element is removed
    win.append(11);
    expectedSum += 11 - 1;
    expect(win.get_sum()).toBe(expectedSum)
    expect(win.get_avg()).toBe(expectedSum / 10)

    // The first element is removed once again
    win.append(11);
    expectedSum += 11 - 2;
    expect(win.get_sum()).toBe(expectedSum)
    expect(win.get_avg()).toBe(expectedSum / 10)

});

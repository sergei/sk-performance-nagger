const SlidingWindow = require('../src/sliding_window')
const SlidingWindowAngle = require("../src/sliding_window_angle");

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

test('Angle average', () => {
    const win = new SlidingWindowAngle(11);

    for(let deg=-5; deg < 6; deg++){
        const rad = deg * Math.PI / 180;
        win.append(rad);
    }
    expect(win.isFull()).toBeTruthy()
    expect(win.get_avg()).toBe(0)

    win.clear()
    for(let deg=0; deg < 110; deg+= 10){
        const rad = deg * Math.PI / 180;
        win.append(rad);
    }
    expect(win.isFull()).toBeTruthy()
    expect(win.get_avg()).toBeCloseTo(50 * Math.PI / 180)

    for(let deg=110; deg < 220; deg+= 10){
        const rad = deg * Math.PI / 180;
        win.append(rad);
    }
    expect(win.isFull()).toBeTruthy()
    expect(win.get_avg()).toBeCloseTo(160 * Math.PI / 180)
});

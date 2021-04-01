const BoatModel = require("./boat_model");
const {NavStats} = require("../src/nav_stats");

test('Ignore short intervals', () => {
    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)

    const startUtc = new Date(2021, 1, 1, 0, 0, 0)
    const startLoc = {latitude: 38., longitude: -122}
    const epochs = boatModel.get_epochs(startUtc, startLoc, 10)

    const onNotification = jest.fn()
    const navStats = new NavStats(console.log, console.log, onNotification);

    epochs.forEach( epoch => {
        navStats.processEpoch(epoch)
    })

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(0)
});

test('Windward rounding', () => {

    const boatModel = new BoatModel(0, 10, -30, 5, 0, 0, 0.5,1)
    boatModel.update(120, {cog:-150})

    const startUtc = new Date(2021, 1, 1, 0, 0, 0)
    const startLoc = {latitude: 38., longitude: -122}
    const epochs = boatModel.get_epochs(startUtc, startLoc, 240)

    const onNotification = jest.fn()
    const navStats = new NavStats(console.log, console.log, onNotification);

    epochs.forEach( epoch => {
        navStats.processEpoch(epoch)
    })

    // The callback should not be called
    expect(onNotification.mock.calls.length).toBe(1)
});

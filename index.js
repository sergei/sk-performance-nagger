const {PATH_MAP} = require("./src/nav_stats");
const {NavStats} = require("./src/nav_stats");
module.exports = function (app) {
    var plugin = {};
    plugin.id = 'sk-performance-nagger';
    plugin.name = 'Sailing performance nagger';
    plugin.description = 'This plugin nags the driver with the remark regarding his/her driving performance';

    var unsubscribes = [];
    var navStats = new NavStats(app.error,app.debug, (event, utc, value) => {
        app.debug(event)
        app.debug(value)
        app.handleMessage(plugin.id, {
            updates: [
                {
                    timestamp: utc,
                    values: [
                        {
                            path: 'notifications.performance.' + event,
                            value: value
                        }
                    ]
                }
            ]
        })
    });

    plugin.start = function (options, restartPlugin) {
        app.debug('Plugin started');
        const paths = Object.keys(PATH_MAP).map( (k) => ({path: k, period: 1000}));
        app.debug('Subscribing to ', paths);

        let localSubscription = {
            context: '*', // Get data for all contexts
            subscribe: paths
        };

        app.subscriptionmanager.subscribe(
            localSubscription,
            unsubscribes,
            subscriptionError => {
                app.error('Error:' + subscriptionError);
            },
            delta => {
                delta.updates.forEach(u => {
                    navStats.processDelta(u);
                });
            }
        );
    };

    plugin.stop = function () {
        // Here we put logic we need when the plugin stops
        app.debug('Plugin stopped');
        plugin.stop = function () {
            unsubscribes.forEach(f => f());
            unsubscribes = [];
        };
    };

    plugin.schema = {
        // The plugin schema
    };

    return plugin;
};

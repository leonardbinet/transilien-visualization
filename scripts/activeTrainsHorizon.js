(function(global){
    
    global.generateActiveTrainsChart = function(){
        global.ActiveTrainsChart = c3.generate({
            bindto: '#stacked-area-chart-active-trains',
            data: {
                json: global.activeTrainsData,

                keys: {
                    value: ["total"],
                    x:"date",
                    xFormat: '%Y-%m-%d %H:%M:%S'
                },
            },
            
            axis: {
                x: {
                    type: 'timeseries',
                    tick: {
                        format: '%HH:%MM',
                        outer: false,
                        count: 25                    
                    }
                }
            }
            
        });   
    }
}(window.H))
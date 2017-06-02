(function (global){
    
    global.Graph = function() {
        this.neighbors = {}; // Key = vertex, value = array of neighbors.
        this.cache = [];
    }
    
    global.Graph.prototype.addPathToCache = function (source, target, path) {
        /* This method is used to save previous found paths in following format:
        {
            source: "sourceStopId",
            target: "targetStopId",
            path: ["stop1","stop2"]  // or [] if none
        }
        
        It could be improved by commuting both stations
        */
        this.cache.push({
            source: source,
            target: target,
            path: path
        })
    };
    
    global.Graph.prototype.searchPathInCache = function (source, target) {
        /* This method is used to find previous found paths.
        Return undefined if not found.
        */
        var cachedResult;
        cachedResult = this.cache.find(function(d){
            return (d.source===source && d.target===target);
        });
        if (cachedResult){
            // console.log("Found in cache.")
            return cachedResult.path;
        }
    };

    global.Graph.prototype.addEdge = function (u, v) {

        if (this.neighbors[u] === undefined) {  // Add the edge u -> v.
            this.neighbors[u] = [];
        }
        this.neighbors[u].push(v);
        if (this.neighbors[v] === undefined) {  // Also add the edge v -> u in order
            this.neighbors[v] = [];               // to implement an undirected graph.
        }                                  // For a directed graph, delete
        this.neighbors[v].push(u);              // these four lines.
    };
        
    global.Graph.prototype.bfs = function(source) {
        var queue = [ { vertex: source, count: 0 } ],
        visited = { source: true },
        tail = 0;
        while (tail < queue.length) {
            var u = queue[tail].vertex,
            count = queue[tail++].count;  // Pop a vertex off the queue.
            this.neighbors[u].forEach(function (v) {
                if (!visited[v]) {
                    visited[v] = true;
                    queue.push({ vertex: v, count: count + 1 });
                }
            });
        }
    };

    global.Graph.prototype.shortestPath = function(source, target) {
        /* Find shortest path in graph.
        
        It will return an array of stops between source and target (source and target are not included.)
        */ 
        // first check in cached results
        
        var cachedPath = this.searchPathInCache(source, target);
        if (cachedPath){return cachedPath};
        
        if (source == target) {   // Delete these four lines if
            return [];                 // when the source is equal to
        }                         // the target.
        var queue = [ source ],
        visited = { source: true },
        predecessor = {},
        tail = 0;
        while (tail < queue.length) {
            var u = queue[tail++],  // Pop a vertex off the queue.
            neighbors = this.neighbors[u];
            if (!neighbors){
                console.log("No neighbor for stop "+u);
                if (!global.errors.stopNoNeighboor.find(function(d){return d===u;}))
                global.errors.stopNoNeighboor.push(u);
                return [];
            }
            for (var i = 0; i < neighbors.length; ++i) {
                var v = neighbors[i];
                if (visited[v]) {
                    continue;
                }
                visited[v] = true;
                if (v === target) {   // Check if the path is complete.
                    var path = [ v ];   // If so, backtrack through the path.
                    while (u !== source) {
                        path.push(u);
                        u = predecessor[u];
                    }
                    path.push(u);
                    path.reverse();
                    // remove source and target (last is excluded)
                    path = path.slice(1,path.length);
                    this.addPathToCache(source, target, path);
                    return path;
                    }
                predecessor[v] = u;
                queue.push(v);
            }
        }
        return [];
    };
    
    global.Graph.prototype.isEdge = function(source, target) {
        return (_.contains(this.neighbors[source],target));
    };
    
    // My custom sections
    global.SectionManager = function(){
        this.sections = global.sections;
    };
    
    global.SectionManager.prototype.refreshAtTime = function(unixSeconds){
        var self = this;
        // First flush previous dir0/1 arrays, and set renderedAtTime
        this.sections.forEach(function(section){section.subsections.forEach(function(subsection){
            subsection.atTime = {
                    renderedAtTime: unixSeconds,
                    observed: {
                        dir0: [],
                        dir1: []
                    },
                    scheduled: {
                        dir0: [],
                        dir1: []
                    }
                }
        })})
        // Then add currently active trains
        
        // SCHEDULED
        global.positionedTrains
            .filter(function (d) {return global.isActiveScheduled(unixSeconds, d) ;})
            .forEach(function(train){
            var fromId = train.atTime.scheduled.from.stop_id;
            var toId = train.atTime.scheduled.to.stop_id;
            self.addTrainToSubsection(fromId, toId, train, "scheduled");
        });
        // SCHEDULED POSTPROCESSING
        
        // OBSERVED
        global.positionedTrains
            .filter(function (d) {return global.isActiveObserved(unixSeconds, d) ;})
            .forEach(function(train){
            var fromId = train.atTime.observed.from.stop_id;
            var toId = train.atTime.observed.to.stop_id;
            self.addTrainToSubsection(fromId, toId, train, "observed");
        });
        // OBSERVED POSTPROCESSING
    };
    
    global.SectionManager.prototype.addTrainToSubsection = function(fromId, toId, train, type){
        // type is either observed or scheduled
        var answered = this.sections.filter(function(section){
            var dir0SubSection = section.subsections.find(
                function(subsection){
                    return ((fromId === subsection.from)&&(toId === subsection.to));
            });
            
            var dir1SubSection = section.subsections.find(
                function(subsection){
                    return ((toId === subsection.from)&&(fromId === subsection.to));
            });
            if (dir0SubSection && dir1SubSection){
                console.log("Error trying to assign train to subsection: for given section, two matching subsections");
                return false;
            }
            if (!dir0SubSection && !dir1SubSection){return false;}
            
            if (dir0SubSection){dir0SubSection.atTime[type].dir0.push(train);}
            if (dir1SubSection){dir1SubSection.atTime[type].dir1.push(train);}
            return true;
        });
        /*
        if (answered.length!==1){
            console.log("Error for train from "+fromId+" to "+toId+", there are "+answered.length+" matching sections.");
            console.log(answered);
            console.log(global.stopIdToStop(fromId));
            console.log(global.stopIdToStop(toId));
            return;
        }
        console.log("Good")
        */
    }
}(window.H))


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
            return;                 // when the source is equal to
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
                return;
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
    };
    
    global.Graph.prototype.isEdge = function(source, target) {
        return (_.contains(this.neighbors[source],target));
    };
}(window.H))


class GraphLayout {
    constructor() {
        this.isOpen = false;

        // references to dom elements
        this.drawing = document.getElementById('drawing');
        this.div = document.getElementById('graph') || 
                   document.createElement('div');
        this.div.id = "graph";
        document.body.appendChild(this.div);

        // dimensions & properties
        this.bounds = this.div.getBoundingClientRect();

        // d3 dom references
        this.svg = d3.select('#graph').append('svg')
                    .attr('width', this.bounds.width)
                    .attr('height', this.bounds.height);
        this.g = this.svg.append('g')
                    .attr('transform','translate(' + this.bounds.width/2 + ',' + this.bounds.height/2 + ')');
        this.links = this.g.append('g')
                    .attr('class','links');
        this.nodes = this.g.append('g')
                    .attr('class','nodes');

        // selected words to generate graph around
        this.words = [];
        this.distanceFromRoot = 30; // default value for max dist from root
        this.data = {
            flat: {},
            anchors: [],
            links: []
        };

        // force simulation
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink()
                .id(d => d.id)
                .distance(80)
                // .strength(d => {
                //     function count(l, n) {
                //         return (l.target === n || l.source === n);
                //     }
                //     var strength = 1 / (Math.min(
                //       this.data.links.filter(l => count(l, d.target)).length, 
                //       this.data.links.filter(l => count(l, d.source)).length 
                //       ) + 1);

                //     if (d.source.role === 'link-anchor') strength /= 2;
                //     if (d.target.role === 'link-anchor') strength /= 2;
                //     return strength;
                // })
            )
            .force('collision', d3.forceCollide(d => {
                return d.role === "link-anchor" ? 0 : 20;
            }))
            .force('charge', d3.forceManyBody()
                .strength(d => d.role === "link-anchor" ? 0 : -100)
                // .distanceMax(100)
            )
            .force('center', d3.forceCenter( 0,0 ));
    }

    open() {
        this.isOpen = true;
        this.drawing.classList.add('split-left');
        this.div.classList.add('split-right');
        this.resize();
    }
    close() {
        if (this.isOpen) {
            this.isOpen = false;
            this.drawing.classList.remove('split-left');
            this.div.classList.remove('split-right');            
        }
    }
    resize() {
        this.bounds = this.div.getBoundingClientRect();
        this.svg
            .attr('width', this.bounds.width)
            .attr('height', this.bounds.height);

        this.g
            .attr('transform','translate(' + this.bounds.width/2 + ',' + this.bounds.height/2 + ')');

        if (!this.nodes.selectAll('.node-group').empty()) {
            this.updateGraph();
        }
    }
    graph(words) {
        if (this.words.length === words.length && 
            this.words.every((w,i) => words[i] === w)) { return; }
        else { this.words = words; }

        this.generateData();
        console.log('data', this.data);

        // draw nodes
        this.drawNodes();

        // draw links
        this.drawLinks();

        // set force simulation
        this.updateGraph();
    }

    generateData() {
        // flatten nodes/links within a given distance of selected words
        var d = this.data.flat = {};
        this.words.forEach(root => {
            var maxDepth = this.distanceFromRoot;
            function addToDataset(node,depth) {
                if (depth > maxDepth) { return; } // done
                if (d[node.id] && d[node.id].depth <= depth) { // skip
                    return;
                }

                if (node.type === "WORD") {
                    d[node.id] = {
                        id: node.id,
                        depth: depth,
                        data: node
                    }
                }
                else if (node.type === "LINK") {
                    d[node.id] = {
                        id: node.id,
                        depth: depth,
                        data: node
                    }
                    // recurse to start/endpoint
                    if (node.s) { addToDataset(node.s, depth + 1); }
                    if (node.e) { addToDataset(node.e, depth + 1); }
                }
                // recurse to adjacent links
                var links = [].concat( node.parentsL, node.parentsR );
                links.forEach(l => addToDataset(l, depth + 1));
            }
            addToDataset(root, 0);
        });

        // sort flat data into nodes and links
        var a = this.data.anchors = [];
        var l = this.data.links = [];

        for (var i in d) {
            if (d[i].data.type === "WORD") {
                d[i].role = "word";
                a.push(d[i]);
            }
            else {
                d[i].stops = [];
                d[i].role = "link";
                l.push(d[i]);
            }
        }

        // identify anchors (endpoints of links): can be words or other links
        function getAnchorPoint(node, link) {
            if (d[node.id]) {
                if (d[node.id].role === "word") {
                    return d[node.id];
                }
                else {
                    // create anchor point along link
                    var linkAnchor = {
                        id: node.id,
                        data: node,
                        role: "link-anchor",
                        link: d[node.id],
                        link2: link
                    };
                    linkAnchor.link.stops.push(linkAnchor); // circular ref
                    a.push(linkAnchor);
                    return linkAnchor;
                }
            }
            else {
                // endpoint not in range of data
                var emptyNode = {
                    id: node.id,
                    data:node,
                    role: "nil"
                };
                a.push(emptyNode);
                return emptyNode;
            }            
        }

        l.forEach(link => {
            var s = link.data.s,
                e = link.data.e;

            link.source = getAnchorPoint(s, link);
            link.target = getAnchorPoint(e, link);
        });

        // evenly space stops on initialization
        l.forEach(link => {
            var tmax = link.stops.length + 1;
            link.stops.forEach((stop,i) => {
                stop.t = (i + 1)/tmax;

                // add another hidden link???
                // l.push(
                //     { source: link.source, target: stop, hidden: true, role: "spring" },
                //     { source: link.target, target: stop, hidden: true, role: "spring" }
                // );
            })
        })
    }//end generateData()

    drawNodes() {

        // setup/pre-declared variables
        var colors = d3.scaleSequential(d3.interpolateMagma).clamp(true);
        var sim = this.simulation;
        var drag = d3.drag()
            .on('start', (d) => {
                if (!d3.event.active) {
                    sim.alphaTarget(0.3).restart();
                }
                d.isDragging = true;
                d.fx = d.x,
                d.fy = d.y;
                if (d.role === 'link-anchor') {
                    d.link.cp = d;
                }
            })
            .on('drag', (d) => {
                d.fx = d3.event.x,
                d.fy = d3.event.y;

                if (d.role === 'link-anchor') {
                    var path = d.link.path;
                    var l = path.getTotalLength();

                    var min = Infinity;
                    var tmin = 1;
                    for (var i = 0.05; i < 1; i += 0.05) {
                        var p = path.getPointAtLength(i*l);
                        var dx = p.x - d.x,
                            dy = p.y - d.y;
                        var distSquared = dx*dx + dy*dy;
                        if (distSquared < min) {
                            min = distSquared;
                            tmin = i;
                        }
                    }
                    d.t = tmin;
                }
            })
            .on('end', (d) => {
                if (!d3.event.active) {
                    sim.alphaTarget(0);
                }
                d.isDragging = false;
                if (d.role !== 'link-anchor') {
                    d.fx = d.fy = null;
                }
            });

        // data entry/merge
        var nodeGroup = this.nodes.selectAll('.node-group')
            .data(this.data.anchors);

        nodeGroup.exit().remove();
        var nodeEnter = nodeGroup.enter().append('g')
            .attr('class','node-group')
            .attr("transform", () => {
                return 'translate(' + this.bounds.width/2 + ',' + this.bounds.height/2 + ')';
            });

        nodeEnter.append('circle')
            .attr('class','node');
        var label = nodeEnter.append('g')
            .attr('class','node-label')
            .attr('pointer-events','none')
            .attr('transform','translate(10,-5)');
        label.append('text')
            .style('font-size','0.8em')
            .attr('text-anchor','start');
        label.append('rect')
            .attr('rx',1)
            .attr('ry',1)
            .attr('fill', '#fafaea')
            .attr('stroke','#cacabc');

        nodeGroup = nodeGroup.merge(nodeEnter);
        nodeGroup
            .classed('node-word', d => d.role === 'word')
            .on('mouseover', (d) => {
                if (d.data.type === "WORD") { 
                    mover( d.data ); 
                }
                else if (d.data.type === "LINK") {
                    link_mover( d.link.data );
                    link_mover( d.link2.data );
                }
            })
            .on('mouseout', (d) => {
                if (d.data.type === "WORD") { 
                    mout( d.data ); 
                }
                else if (d.data.type === "LINK") {
                    link_mout( d.link.data );
                    link_mout( d.link2.data );
                }
            })
            .call(drag);

        // draw circle
        var node = nodeGroup.selectAll('.node')
            .data(d => [d])
            .attr('r',(d) => d.role === 'word' ? 7 : 4)
            .attr('stroke', 'rgba(0,0,0,0.2)')
            .attr('fill',(d) => {
                if (d.role !== 'word') {
                    return 'transparent';
                }
                else {
                    return colors((d.depth+2)/10);
                }
            });

        // draw text label
        label = nodeGroup.selectAll('.node-label')
            .raise()
            .data(d => [d]);

        label.select('text')
            .text(d => d.role === "word" ? d.data.val : '')
            .attr('x',5);
        label.select('rect')
            .style('display', d => d.role === "word" ? "block" : "none")
            .attr('width', function() {
                return this.parentNode.getElementsByTagName('text')[0].getBBox().width + 10;
            })
            .attr('height','1.5em')
            .attr('y','-1em')
            .lower();

        this.nodes.selectAll('.node-word').raise();
    }

    drawLinks() {
        var link = this.links.selectAll('.link')
            .data(this.data.links);

        link.enter().append('path')
            .datum(function(d) { d.path = this; return d; })
            .attr('class','link')
            .attr('fill','none')
            .attr('stroke','rgba(0,0,0,0.8)')
            .attr('stroke-width',0.5)
        .merge(link)

        link.exit().remove();
    }

    updateGraph() {
        var node = this.nodes.selectAll('.node-group'),
            link = this.links.selectAll('.link');

        var margin = 10;
        var clampX = d3.scaleLinear()
                .domain([margin-this.bounds.width/2, this.bounds.width/2-margin])
                .range([margin-this.bounds.width/2, this.bounds.width/2-margin])
                .clamp(true),
            clampY = d3.scaleLinear()
                .domain([margin-this.bounds.height/2, this.bounds.height/2-margin])
                .range([margin-this.bounds.height/2, this.bounds.height/2-margin])
                .clamp(true);

        function tick() {
          var line = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRom);

          link
            .attr('d', d => d.cp ? line([d.source, d.cp, d.target]) 
                            : line([d.source, d.target]) );
          node
            .datum(d => { 
                if (d.role !== 'link-anchor') {
                    d.x = clampX(d.x);
                    d.y = clampY(d.y);
                }
                else if (!d.isDragging) {
                    var path = d.link.path;
                    var l = path.getTotalLength();
                    var p = path.getPointAtLength(d.t * l);
                    d.fx = p.x;
                    d.fy = p.y;
                }
                return d; 
            })
            .attr("transform", (d) => {
                return 'translate(' + d.x + ',' + d.y + ')';
            });

        }

        this.simulation
            .nodes(this.data.anchors)
            .on('tick', tick);

        this.simulation.force('link').links(this.data.links);

        if (this.simulation.alpha() < 0.1) {
            this.simulation.alpha(0.3).restart();
        }
    }
}//end class GraphLayout

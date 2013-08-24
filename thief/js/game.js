/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";

    var gameCanvas = document.createElement("canvas");
    gameCanvas.id = "game";
    gameCanvas.width = 640;
    gameCanvas.height = 480;

    function loadTileset(tileset) {
        var img = new Image();
        var deferred = $.Deferred();

        img.onload = function () {
            console.log("Image loaded");
            deferred.resolve();
        };

        img.src = tileset.image;
        tileset.img = img;

        return deferred.promise();
    }

    function loadMap(json, callback) {
        var map = json;
        var tilesetLoaders = [];

        _.each(map.tilesets, function (tileset) {
            tilesetLoaders.push(loadTileset(tileset));
        });
        
        $.when.apply(null, tilesetLoaders).done(function () {
            callback(map);
        });
    }


    $("div#container").append(gameCanvas);

    function toXY(index, width) {
        return {
            x: index % width,
            y: Math.floor(index / width)
        };
    }

    function fromXY(x, y, th, tw, width) {
        return (Math.floor(y / th) * width) + Math.floor(x / tw);
    }

    function prepareMap(map) {

        map.toXY = function (index) {
            return toXY(index, this.width);
        };

        map.fromXY = function (x, y) {
            return fromXY(x, y, this.tilewidth, this.tileheight, this.width);
        };

        map.findTileset = function(gid) {
            var tilesets = _.filter(this.tilesets, function (tileset) {
                return gid >= tileset.firstgid;
            });

            if (tilesets.length === 0) {
                return undefined;
            }

            return _.max(tilesets, function (tileset) {
                return tileset.firstgid;
            });
        };

        map.drawTileLayer = function(layer, ctx) {
            for (var i = 0; i < layer.data.length; i++) {
                var gid = layer.data[i];
                var xy = this.toXY(i);

                var tileset = this.findTileset(gid);

                if (tileset) {
                    var txy = toXY(gid - tileset.firstgid,
                            tileset.imagewidth / tileset.tilewidth);

                    ctx.drawImage(tileset.img,
                        txy.x * tileset.tilewidth,
                        txy.y * tileset.tileheight,
                        tileset.tilewidth,
                        tileset.tileheight,
                        xy.x * this.tilewidth,
                        xy.y * this.tileheight,
                        tileset.tilewidth,
                        tileset.tileheight);
                }
            }
        };

        map.drawEntity = function(entity, ctx) {
            var gid = entity.gid;
            var tileset = this.findTileset(gid);
            if (tileset) {
                var txy = toXY(gid - tileset.firstgid, 
                    tileset.imagewidth / tileset.tilewidth);

                ctx.drawImage(tileset.img,
                    txy.x * tileset.tilewidth,
                    txy.y * tileset.tileheight,
                    tileset.tilewidth,
                    tileset.tileheight,
                    entity.x - (entity.width / 2),
                    entity.y - (entity.height / 2),
                    tileset.tilewidth,
                    tileset.tileheight);
            }
        };

        map.getLayer = function(name) {
            return _.find(this.layers, function (layer) {
                return layer.name === name;
            });
        };

        // Returns tile properties
        map.getTileProps = function(layer, x, y) {
            var index = this.fromXY(x, y); 
            var gid = layer.data[index];

            if (!gid) return null;
            var tileset = this.findTileset(gid);
            if (!tileset) return null;
            gid -= tileset.firstgid;

            var props = tileset.tileproperties;
            return props[gid];
        };

        return map;
    }


    function playGame(map) {
        // Preload some stuff, so we don't need to ask everytime where stuff is
        var ctx = gameCanvas.getContext('2d');
        var bgLayer = map.getLayer("background");
        var entLayer = map.getLayer("entities");
        var actions = {
            "up": false,
            "down": false,
            "left": false,
            "right": false
        };
        var keys = {
            87: "up",
            65: "left",
            83: "down",
            68: "right"
        };

        var player = {
            x: 0,
            y: 0
        };

        function prepareEntity(entity, map) {
            entity.map = map;
            // The origin of every entity is at its center
            entity.x += entity.width / 2;
            entity.y -= entity.height / 2;
            entity.target = {
                x: entity.x,
                y: entity.y
            }

            entity._update = function (dt) {
                var speed = this.properties.speed;
                var angle = Math.atan2(this.target.y - this.y,
                       this.target.x - this.x);

                var nx = this.x + speed * Math.cos(angle) * dt;
                var ny = this.y + speed * Math.sin(angle) * dt;

                this.moveTo(nx, ny);
            }

            entity.update = function (dt) {
                this._update(dt);
            }

            entity.moveTo = function (x, y) {
                var props = this.map.getTileProps(bgLayer, x, y);
                
                if (props && props.walkable === "true") {
                    this.x = x;
                    this.y = y;
                    return true;
                } else {
                    return false;
                }
            };

            entity.moveRelative = function (x, y) {
                var properties;
                var speed = 1.0;
                
                properties = this.properties;
                if (properties && properties.speed) {
                    speed = properties.speed;
                }
                this.setTarget(this.x + (x * speed), this.y + (y * speed));
            }

            entity.setTarget = function (x, y) {
                this.target.x = x;
                this.target.y = y;
            }

            return entity;
        }

        function loadEntities(layer) {
            player = _.find(layer.objects, function (obj) {
                return obj.type === "player";
            });

            player = prepareEntity(player, map);
        }

        function processInput(dt) {
            var dx = 0, dy = 0;
            if (actions.left) {
                dx = -1;
            } else if (actions.right) {
                dx = 1;
            }

            if (actions.up) {
                dy = -1;
            } else if (actions.down) {
                dy = 1;
            }

            if (dx != 0 || dy != 0) {
                player.moveRelative(dx * dt, dy * dt);
            }
        }

        function processLogic(dt) {
            player.update(dt);
        }
        
        function renderGame() {
            map.drawTileLayer(bgLayer, ctx);
            map.drawEntity(player, ctx);
        }

        loadEntities(entLayer);

        $(gameCanvas).on("mouseup touchend", function (e) {
            var x;
            var y;
            var ev;
            e.preventDefault();

            if (e.type === "mouseup") {
                ev = e;
            } else if (e.type == "touchend") {
                var touches = e.originalEvent.changedTouches;
                if (touches.length != 1) {
                    return false;
                }
                var touch = touches[0];
                ev = touch;
            }

            var offset = $(gameCanvas).offset();
            x = ev.pageX - offset.left;
            y = ev.pageY - offset.top;

            player.setTarget(x, y);

            return false;
        });

        $(window).on("keydown keyup", function (e) {
            var action = keys[e.keyCode];
            if (action) {
                actions[action] = (e.type == "keydown");
            }
        });

        var lastUpdate = new Date().getTime();
        function mainloop() {
            var curTime = new Date().getTime();
            var dt = (curTime - lastUpdate) / 60;

            processInput(dt);
            processLogic(dt);
            renderGame();

            lastUpdate = new Date().getTime();
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(mainloop);
            } else {
                window.setTimeout(mainloop, 1000 / 60);
            }
        }

        mainloop();
    }

    $(document).ready(function () {

        $(document).on("touchmove", function(e) {
            e.preventDefault();
        }, false);

        $.getJSON("maps/demo.json", function (json) {
            loadMap(json, function (map) {
                console.log("Map loaded");
                
                var newMap = prepareMap(map);
                playGame(newMap);
            });
        });

    });
}());

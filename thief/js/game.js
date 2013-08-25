/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";

    var framebuffer = document.createElement("canvas");
    var gameCanvas = document.createElement("canvas");
    var bgrender = document.createElement("canvas");

    gameCanvas.id = "game";
    function updateWidth() {
        framebuffer.width = gameCanvas.width = window.innerWidth;
        framebuffer.height = gameCanvas.height = window.innerHeight;
    }

    function loadTileset(tileset) {
        var img = new Image();
        var deferred = $.Deferred();

        img.onload = function () {
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

        var bgCanvas = document.createElement("canvas");
        bgCanvas.width = map.width * map.tileheight;
        bgCanvas.height = map.height * map.tilewidth;
        bgCanvas.dirty = true;
        map._bgCanvas = bgCanvas;

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

        map._drawTileLayer = function(layer, ctx) {
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
                        Math.floor(xy.x * this.tilewidth),
                        Math.floor(xy.y * this.tileheight),
                        tileset.tilewidth,
                        tileset.tileheight);
                }
            }
        };

        map.drawTileLayer = function (layer, ctx) {
            var bgCanvas = map._bgCanvas;
            var nctx = bgCanvas.getContext("2d");
            if (bgCanvas.dirty) {
                console.log("Dirty background. Redrawing...");
                map._drawTileLayer(layer, nctx);
                map._bgCanvas.dirty = false;
            }
            ctx.drawImage(bgCanvas, 0, 0);
        }

        map.drawEntity = function(entity, cam, ctx) {
            if (entity.visible === false) {
                return;
            }

            var gid = entity.gid;
            var tileset = this.findTileset(gid);

            var real_x = entity.x - cam.offx;
            var real_y = entity.y - cam.offx;
            var ew2 = entity.width / 2;
            var eh2 = entity.height / 2;


            if (tileset) {
                var txy = toXY(gid - tileset.firstgid, 
                    tileset.imagewidth / tileset.tilewidth);

                ctx.drawImage(tileset.img,
                    txy.x * tileset.tilewidth,
                    txy.y * tileset.tileheight,
                    tileset.tilewidth,
                    tileset.tileheight,
                    Math.floor(entity.x - ew2),
                    Math.floor(entity.y - eh2),
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
        var quit = false;
        var outCtx = gameCanvas.getContext('2d');
        var fbCtx = framebuffer.getContext('2d');
        outCtx.mozImageSmoothingEnable = false;
        fbCtx.mozImageSmoothingEnable = false;

        var bgLayer = map.getLayer("background");
        var aiLayer = map.getLayer("ai");
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
            68: "right",

            38: "up",
            37: "left",
            40: "down",
            39: "right"

        };

        var player = {};
        var treasure = {};
        var guards = [];

        var camera = {
            offx: undefined,
            offy: undefined
        };

        var countdown = {
            startTime: undefined,
            failed: false,

            reset: function () {
                this.startTime = undefined;
                this.failed = false;
            },
            
            start: function () {
                this.startTime = this.curTime = new Date().getTime();
                this.failed = false;
            },

            update: function () {
                if (!this.startTime) return;

                var curTime = new Date().getTime();
                var diff = (10000) - (curTime - this.startTime);

                var secs = Math.floor(diff / 1000);
                var cents = Math.floor(diff / 10) % 100;
                this.str = "00:" + 
                    (secs < 10 ? "0" : "") + secs + ":" +
                    (cents < 10 ? "0" : "") + cents; 

                if (diff <= 0) {
                    this.failed = true;
                    this.str = "00:00:00";
                }
            },

            render: function (ctx) {
                if (!this.startTime) return;

                ctx.save();
                ctx.font = "20pt monospace";
                ctx.strokeText(this.str, 50, 50);
                ctx.restore();
            }
        };

        function prepareEntity(entity, map) {
            entity.map = map;
            // The origin of every entity is at its center
            entity.x += entity.width / 2;
            entity.y -= entity.height / 2;
            entity.start = {
                x: entity.x,
                y: entity.y
            }
            entity.target = undefined;
            entity.wallHit = false;

            entity._reset = function () {
                this.x = this.start.x;
                this.y = this.start.y;
                this.target = undefined;
                this.wallHit = false;
            }

            entity.reset = function () {
                this._reset();
            }

            entity._update = function (dt) {
                if (this.target === undefined) {
                    return;
                }
                var speed = this.properties.speed;

                var tx = this.target.x;
                var ty = this.target.y;

                var angle = Math.atan2(ty - this.y, tx - this.x);

                var nx = this.x + speed * Math.cos(angle) * dt;
                var ny = this.y + speed * Math.sin(angle) * dt;

                this.wallHit = !this.moveTo(nx, ny);

                var sdt = speed * dt;

                if ((
                    this.x > (tx - sdt) && this.x < (tx + sdt) &&
                    this.y > (ty - sdt) && this.y < (ty + sdt)
                )) {

                   this.target = undefined;
                }
            }

            entity.update = function (dt) {
                this._update(dt);
            }

            entity.moveTo = function (x, y) {
                var map = this.map;
                var props = map.getTileProps(bgLayer, this.x, y);
                
                if (props && props.walkable === "true") {
                    this.y = y;
                }
                
                props = map.getTileProps(bgLayer, x, this.y);
                if (props && props.walkable === "true") {
                    this.x = x;
                }

                props = map.getTileProps(bgLayer, x, y);
                return props && props.walkable == "true";
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
                this.target = {x: x, y: y};
            }

            entity.collide = function (other) {
                var mw2 = this.width / 2;
                var mh2 = this.height / 2;
                
                var ow2 = other.width / 2;
                var oh2 = other.height / 2;

                var myCorners = [
                    {x: this.x - mw2, y: this.y - mh2}, // TL
                    {x: this.x + mw2, y: this.y - mh2}, // TR
                    {x: this.x - mw2, y: this.y + mh2}, // BL
                    {x: this.x + mw2, y: this.y + mh2}  // BR
                ];

                var ret = _.all(myCorners, function (corner) {
                    var xOK = (corner.x < (other.x - ow2) || corner.x > (other.x + ow2));
                    var yOK = (corner.y < (other.y - oh2) || corner.y > (other.y + oh2));

                    return xOK || yOK;
                });

                return !ret; 
            }

            entity.hasHitWall = function () {
                var ret = this.wallHit;
                this.wallHit = false;
                return ret;
            }

            return entity;
        }

        function prepareGuard(entity, map) {
            var guard = prepareEntity(entity, map);

            guard.order = "follow";

            if (guard.properties.aiorder) {
                guard.aiorder = "stop";
            } else {
                guard.aiorder = guard.properties.aiorder
            }

            guard.orders = {
                rand: function (ent, dt) {
                    if (ent.target === undefined || ent.hasHitWall()) {
                        var dir = Math.floor(Math.random() * 4);
                        var amt = Math.floor(Math.random() * 200);
                        
                        switch (dir) {
                        case 0:
                            ent.setTarget(ent.x + amt, ent.y);
                            break;
                        case 1:
                            ent.setTarget(ent.x - amt, ent.y);
                            break;
                        case 2:
                            ent.setTarget(ent.x, ent.y + amt);
                            break;
                        case 3:
                            ent.setTarget(ent.x, ent.y - amt);
                            break;
                        }
                    }
                }, pause: function (ent, dt) {
                    var curTime = new Date().getTime();
                    if (ent.pauseTime === undefined) {
                        ent.pauseTime = curTime;
                    }

                    if (curTime - ent.pauseTime > 1000) {
                        ent.order = prevOrder; 
                    }
                }, left : function (ent, dt) {
                    ent.moveRelative(-dt, 0);
                }, right: function (ent, dt) {
                    ent.moveRelative(dt, 0);
                }, up : function (ent, dt) {
                    ent.moveRelative(0, -dt);
                }, down: function (ent, dt) {
                    ent.moveRelative(0, dt);
                }, follow: function (ent, dt) {
                    ent.setTarget(player.x, player.y);
                }, stop: function (ent, dt) {
                }
            }

            guard.update = function (dt) {
                var props = this.map.getTileProps(aiLayer, this.x, this.y);

                if (props && props.aiorder) {
                    if (this.aiorder !== props.aiorder) {
                        this.prevOrder = this.aiorder;
                        this.aiorder = props.aiorder;
                    }
                }

                var fun = this.orders[this.aiorder];
                if (fun !== undefined) {
                    fun(this, dt);
                }

                this._update(dt);
            }

            return guard;
        }

        function preparePlayer(entity, map) {
            var player = prepareEntity(entity, map);

            player.reset = function () {
                this.treasures = 0;
                this._reset();
            }

            player.reset();
            return player;
        }

        function prepareTreasure(entity, map) {
            var treasure = prepareEntity(entity, map);
            treasure.isOpen = false;
            treasure.properties.closedgid = treasure.gid;
            
            treasure.reset = function () {
                this.isOpen = false;
                this.visible = true;
                this.gid = treasure.properties.closedgid;
                this._reset();
            }

            treasure.open = function (player) {
                if (this.isOpen) return;
                this.visible = false;
                this.gid = this.opengid;
                player.treasures++;
                this.isOpen = true;
                countdown.start();
            }
            return treasure;
        }

        function loadEntities(layer) {
            player = _.find(layer.objects, function (obj) {
                return obj.type === "player";
            });

            treasure = _.find(layer.objects, function (obj) {
                return obj.type === "treasure";
            });

            var guards_ = _.select(layer.objects, function (obj) {
                return obj.type === "guard";
            });

            player = preparePlayer(player, map);
            treasure = prepareTreasure(treasure, map);

            guards = _.map(guards_, function (guard) {
                return prepareGuard(guard, map);
            });
        }

        function restartLevel(layer) {
            player.reset();
            treasure.reset();
            _.each(guards, function (guard) {
                guard.reset();
            });
            countdown.reset();
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
            /* Update camera */
            var toFollow = player;

            // Thanks Aru!
            if (camera.tempx && camera.tempx) {
                camera.tempx = ((camera.tempx * 5 + toFollow.x) / 6);
                camera.tempy = ((camera.tempy * 5 + toFollow.y) / 6);
            } else {
                camera.tempx = toFollow.x;
                camera.tempy = toFollow.y;
            }
            camera.offx = (gameCanvas.width / 2) - camera.tempx;
            camera.offy = (gameCanvas.height / 2) - camera.tempy;

            player.update(dt);
            _.each(guards, function (guard) {
                guard.update(dt);
            });

            if (player.collide(treasure)) {
                treasure.open(player);
            }
            
            countdown.update();
            
            /* Check if timeout */
            if (countdown.failed) {
                restartLevel();
                return;
            }

            /* Check if any guard hit the thief */
            var guards_ = _.filter(guards, function (guard) {
                return player.collide(guard);
            }); 

            if (guards_.length > 0) {
                restartLevel();
                return;
            }

            /* Check if thief is on exit */
            var props = map.getTileProps(bgLayer, player.x, player.y);
            if (props && props.isexit && props.isexit === "true") {
                if (player.treasures > 0) {
                    quit = true;
                    changeLevel(map.properties.nextmap);
                }
            };

        }
        
        function renderGame() {
            framebuffer.width = framebuffer.width;
            
            fbCtx.save();
            fbCtx.translate(Math.floor(camera.offx), Math.floor(camera.offy));

            map.drawTileLayer(bgLayer, fbCtx);
            //map._drawTileLayer(aiLayer, fbCtx);
            map.drawEntity(treasure, camera, fbCtx);
            _.each(guards, function (guard) {
                map.drawEntity(guard, camera, fbCtx);
            });

            map.drawEntity(player, camera, fbCtx);
            fbCtx.restore();

            countdown.render(fbCtx);

            outCtx.clearRect(0, 0, screen.width, screen.height); 
            outCtx.drawImage(framebuffer, 0, 0);
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
            x = ev.pageX - offset.left - camera.offx;
            y = ev.pageY - offset.top - camera.offy;

            player.setTarget(x, y);

            return false;
        });

        $(window).on("keydown keyup", function (e) {
            e.preventDefault();
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

            lastUpdate = curTime;
            if (!quit) {
                if (window.requestAnimationFrame) {
                    window.requestAnimationFrame(mainloop);
                } else {
                    window.setTimeout(mainloop, 1000 / 60);
                }
            }
        }

        mainloop();
    }

    function changeLevel(filename) {
        $.getJSON("maps/" + filename, function (json) {
            loadMap(json, function (map) {
                console.log("Map loaded");
                
                var newMap = prepareMap(map);
                playGame(newMap);
            });
        });
    }
    
    // From: http://stackoverflow.com/a/901144
    function getParameterByName(name) {
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    $(document).ready(function () {
        $(document).on("touchmove", function(e) {
            e.preventDefault();
        }, false);
        
        var levelName = getParameterByName("map");
        if (levelName === "") {
            levelName = "intro.json";
        }

        changeLevel(levelName);
    });

    $(window).on("resize", updateWidth);
    updateWidth();
}());

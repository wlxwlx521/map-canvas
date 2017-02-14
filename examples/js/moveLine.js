(function (window, factory) {
    if (typeof define === "function" && define.amd) {
        //AMD
        define(factory);
    } else if (typeof module === "object" && module.exports) {
        //CMD
        module.exports = factory();
    } else {
        //window
        window.MoveLine = factory();
    }

}(typeof window !== "undefined" ? window : this, function (map, userOptions) {
    var MoveLine = function (map, userOptions) {

        "user strict";

        var self = this;

        //默认参数
        var options = {
            //marker点半径
            markerRadius: 3,
            //marker点颜色,为空或null则默认取线条颜色
            markerColor: '#fff',
            //线条类型 solid、dashed、dotted
            lineType: 'solid',
            //线条宽度
            lineWidth: 1,
            //线条颜色
            colors: ['#F9815C', '#F8AB60', '#EDCC72', '#E2F194', '#94E08A', '#4ECDA5'],
            //移动点半径
            moveRadius: 2,
            //移动点颜色
            fillColor: '#fff',
            //移动点阴影颜色
            shadowColor: '#fff',
            //移动点阴影大小
            shadowBlur: 5,
        };

        //全局变量
        var baseLayer = null,
            animationLayer = null,
            width = map.getSize().width,
            height = map.getSize().height,
            animationFlag = true,
            markLines = [];

        //参数合并
        var merge = function (userOptions, options) {
            Object.keys(userOptions).forEach(function (key) {
                options[key] = userOptions[key];
            });
        }

        function Marker(opts) {
            this.city = opts.city;
            this.location = opts.location;
            this.color = opts.color;
        }

        Marker.prototype.draw = function (context) {
            var pixel = this.pixel = map.pointToPixel(this.location);

            context.save();
            context.beginPath();
            context.fillStyle = options.markerColor || this.color;
            context.arc(pixel.x, pixel.y, options.markerRadius, 0, Math.PI * 2, true);
            context.closePath();
            context.fill();

            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '12px Microsoft YaHei';
            context.fillStyle = this.color;
            context.fillText(this.city, pixel.x, pixel.y - 10);
            context.restore();
        }

        function MarkLine(opts) {
            this.from = opts.from;
            this.to = opts.to;
            this.id = opts.id;
            this.index = 0;
        }

        MarkLine.prototype.getPointList = function (from, to) {
            var points = [
                [from.x, from.y],
                [to.x, to.y]
            ];
            var ex = points[1][0];
            var ey = points[1][1];
            points[3] = [ex, ey];
            points[1] = this.getOffsetPoint(points[0], points[3]);
            points[2] = this.getOffsetPoint(points[3], points[0]);
            points = this.smoothSpline(points, false);
            //修正最后一点在插值产生的偏移
            points[points.length - 1] = [ex, ey];
            return points;
        }

        MarkLine.prototype.getOffsetPoint = function (start, end) {
            var distance = this.getDistance(start, end) / 3; //除以3？
            var angle, dX, dY;
            var mp = [start[0], start[1]];
            var deltaAngle = -0.2; //偏移0.2弧度
            if (start[0] != end[0] && start[1] != end[1]) { //斜率存在
                var k = (end[1] - start[1]) / (end[0] - start[0]);
                angle = Math.atan(k);
            } else if (start[0] == end[0]) { //垂直线
                angle = (start[1] <= end[1] ? 1 : -1) * Math.PI / 2;
            } else { //水平线
                angle = 0;
            }
            if (start[0] <= end[0]) {
                angle -= deltaAngle;
                dX = Math.round(Math.cos(angle) * distance);
                dY = Math.round(Math.sin(angle) * distance);
                mp[0] += dX;
                mp[1] += dY;
            } else {
                angle += deltaAngle;
                dX = Math.round(Math.cos(angle) * distance);
                dY = Math.round(Math.sin(angle) * distance);
                mp[0] -= dX;
                mp[1] -= dY;
            }
            return mp;
        }

        MarkLine.prototype.smoothSpline = function (points, isLoop) {
            var len = points.length;
            var ret = [];
            var distance = 0;
            for (var i = 1; i < len; i++) {
                distance += this.getDistance(points[i - 1], points[i]);
            }
            var segs = distance / 2;
            segs = segs < len ? len : segs;
            for (var i = 0; i < segs; i++) {
                var pos = i / (segs - 1) * (isLoop ? len : len - 1);
                var idx = Math.floor(pos);
                var w = pos - idx;
                var p0;
                var p1 = points[idx % len];
                var p2;
                var p3;
                if (!isLoop) {
                    p0 = points[idx === 0 ? idx : idx - 1];
                    p2 = points[idx > len - 2 ? len - 1 : idx + 1];
                    p3 = points[idx > len - 3 ? len - 1 : idx + 2];
                } else {
                    p0 = points[(idx - 1 + len) % len];
                    p2 = points[(idx + 1) % len];
                    p3 = points[(idx + 2) % len];
                }
                var w2 = w * w;
                var w3 = w * w2;

                ret.push([
                    this.interpolate(p0[0], p1[0], p2[0], p3[0], w, w2, w3),
                    this.interpolate(p0[1], p1[1], p2[1], p3[1], w, w2, w3)
                ]);
            }
            return ret;
        }

        MarkLine.prototype.interpolate = function (p0, p1, p2, p3, t, t2, t3) {
            var v0 = (p2 - p0) * 0.5;
            var v1 = (p3 - p1) * 0.5;
            return (2 * (p1 - p2) + v0 + v1) * t3 + (-3 * (p1 - p2) - 2 * v0 - v1) * t2 + v0 * t + p1;
        };

        MarkLine.prototype.getDistance = function (p1, p2) {
            return Math.sqrt(
                (p1[0] - p2[0]) * (p1[0] - p2[0]) +
                (p1[1] - p2[1]) * (p1[1] - p2[1])
            );
        }

        MarkLine.prototype.drawMarker = function (context) {
            this.from.draw(context);
            this.to.draw(context);
        }

        MarkLine.prototype.drawLinePath = function (context) {
            var pointList = this.path = this.getPointList(map.pointToPixel(this.from.location), map.pointToPixel(this.to.location));
            var len = pointList.length;
            context.save();
            context.beginPath();
            context.lineWidth = options.lineWidth;
            context.strokeStyle = options.colors[this.id];

            if (!options.lineType || options.lineType == 'solid') {
                context.moveTo(pointList[0][0], pointList[0][1]);
                for (var i = 0; i < len; i++) {
                    context.lineTo(pointList[i][0], pointList[i][1]);
                }
            } else if (options.lineType == 'dashed' || options.lineType == 'dotted') {
                for (var i = 1; i < len; i += 2) {
                    context.moveTo(pointList[i - 1][0], pointList[i - 1][1]);
                    context.lineTo(pointList[i][0], pointList[i][1]);
                }
            }
            context.stroke();
            context.restore();
            this.index = 0; //缩放地图时重新绘制动画
        }

        MarkLine.prototype.drawMoveCircle = function (context) {
            var pointList = this.path || this.getPointList(map.pointToPixel(this.from.location), map.pointToPixel(this.to.location));

            context.save();
            context.fillStyle = options.fillColor;
            context.shadowColor = options.shadowColor;
            context.shadowBlur = options.shadowBlur;
            context.beginPath();
            context.arc(pointList[this.index][0], pointList[this.index][1], options.moveRadius, 0, Math.PI * 2, true);
            context.fill();
            context.closePath();
            context.restore();
            this.index += 1;
            if (this.index >= pointList.length) {
                this.index = 0;
            }
        }

        //底层canvas渲染，标注，线条
        var brush = function () {
            var baseCtx = baseLayer.canvas.getContext('2d');
            if (!baseCtx) {
                return;
            }

            addMarkLine();

            baseCtx.clearRect(0, 0, width, height);

            markLines.forEach(function (line) {
                line.drawMarker(baseCtx);
                line.drawLinePath(baseCtx);
            });
        }

        //上层canvas渲染，动画效果
        var render = function () {
            var animationCtx = animationLayer.canvas.getContext('2d');
            if (!animationCtx) {
                return;
            }

            if (!animationFlag) {
                animationCtx.clearRect(0, 0, width, height);
                return;
            }

            animationCtx.fillStyle = 'rgba(0,0,0,.93)';
            var prev = animationCtx.globalCompositeOperation;
            animationCtx.globalCompositeOperation = "destination-in";
            animationCtx.fillRect(0, 0, width, height);
            animationCtx.globalCompositeOperation = prev;

            for (var i = 0; i < markLines.length; i++) {
                var markLine = markLines[i];
                markLine.drawMoveCircle(animationCtx);
            }
        }

        //鼠标事件
        var mouseInteract = function () {
            map.addEventListener('movestart', function () {
                animationFlag = false;
            });

            map.addEventListener('moveend', function () {
                markLines.forEach(function (markLine) {
                    markLine.index = 0;
                });
                animationFlag = true;
            });

            map.addEventListener('zoomstart', function () {
                animationFlag = false;
            });

            map.addEventListener('zoomend', function () {
                markLines.forEach(function (markLine) {
                    markLine.index = 0;
                });
                animationFlag = true;
            });
        }

        var addMarkLine = function () {
            markLines = [];
            var dataset = options.data;
            data.forEach(function (line, i) {
                markLines.push(new MarkLine({
                    id: i,
                    from: new Marker({
                        city: line.from.city,
                        location: new BMap.Point(line.from.lnglat[0], line.from.lnglat[1]),
                        color: options.colors[i]
                    }),
                    to: new Marker({
                        city: line.to.city,
                        location: new BMap.Point(line.to.lnglat[0], line.to.lnglat[1]),
                        color: options.colors[i]
                    })
                }));
            });
        }

        //初始化
        var init = function (map, options) {
            merge(userOptions, options);

            baseLayer = new CanvasLayer({
                map: map,
                update: brush
            });

            animationLayer = new CanvasLayer({
                map: map,
                update: render
            });

            mouseInteract();

            (function drawFrame() {
                window.requestAnimationFrame(drawFrame);
                render();
            }());
        }

        init(map, options);

        self.options = options;
    }

    MoveLine.prototype.update = function (resetOpts) {
        for (var key in resetOpts) {
            this.options[key] = resetOpts[key];
        }
    }

    window.requestAnimationFrame = (function () {
        return window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            window.msRequestAnimationFrame ||
            function (callback) {
                window.setTimeout(callback, 1000 / 20);
            };
    })();

    return MoveLine;
}))
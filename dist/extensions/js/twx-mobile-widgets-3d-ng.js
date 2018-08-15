/* begin copyright text
 *
 * Copyright © 2016 PTC Inc., Its Subsidiary Companies, and /or its Partners. All Rights Reserved.
 *
 * end copyright text
 */
/* jshint latedef:false, multistr:true */
/* globals Module, VF_ANG, $, ThingView, escape: true */

/**
 * This file is the js Thingview renderer adapter, used in the canvas and preview pages to render 3d content.
 * It is not included in the experience runtime in the View app for mobile
 * Note that there are 2 controllers, 2 cvapi callbacks, etc below for each use-case (canvas, preview)
 * The ThingView init callback cannot take multiple listeners yet.
 */
(function () {
  'use strict';

  // Inform vuforia-angular.js about the configuration and capabilities of the preview client
  window.thingworxview = {
    configuration: {
      platform: 'preview',
      nativeSequencer: true,
      setModelURL: true
    }
  };

  var selectedWidget;
  var unRegSelect, unRegDeselect, unRegMove, unRegLoaded, unRegReady, unRegLoadErr;

  var twxWidgets = angular.module('twx-mobile-widgets-3d-ng', []);
  var twxWidgets2 = angular.module('twx.byoc', []);

  twxWidgets.factory('threeJsTmlRenderer', renderer);
  twxWidgets2.factory('threeJsTmlRenderer', renderer);
  twxWidgets.value('thingViewPath', 'extensions');
  twxWidgets2.value('thingViewPath', 'extensions');


  function renderer($rootScope, $timeout, thingViewPath) {
    /* jshint validthis: true */
    var session, cvApi;
    var ctx = this;
    var floorsize = { size: 0, pos: { x: 0, y: 0 } };
    var stepPlaying = false;
    $rootScope.thingViewReady = false;

    var getCanvasOffsetTop = function(el) {
      var offsetTop = 0;
      var offsetParent = el.offsetParent;
      while (offsetParent && offsetParent.tagName !== 'body') {
        offsetTop += offsetParent.offsetTop;
        offsetParent = offsetParent.offsetParent;
      }
      getCanvasOffsetTop = function() { return offsetTop; }; //Memoize
      return offsetTop;
    };

    function cvApiReady() {
      if (!$rootScope.thingViewReady) {
         $rootScope.thingViewReady = true;
         addTwxCallbacks();
         $rootScope.$applyAsync();
      }

      var els = document.querySelectorAll('twx-dt-view');
      if (els && els.length) {
        var el = els[els.length - 1];
        if (el) {
          if (!el.id) {
            el.id = 'twxDtView' + Date.now();

            if (el.parentElement) {
              var parent = el.parentElement;
              parent.setAttribute('style', 'position: absolute; width: 100vw; height: 100vh; top: 0px; left: 0px;');
            }
          }
        }

        var initFlags =
            Module.ThingViewInitFlags.CLEAR_UNUSED_SHAPES_ON_DESTRUCTION.value | // jshint bitwise:false
            Module.ThingViewInitFlags.ENABLE_HIDDEN_RC_SHAPE_INSTANCE.value |
            Module.ThingViewInitFlags.USE_ADVANCED_SELECTION_MANAGER.value |
            Module.ThingViewInitFlags.USE_OVERRIDE_INHERIT_BEHAVIOUR.value;

        if (window.builderSettings.annotationsEnabled === true) {
          initFlags = initFlags | Module.ThingViewInitFlags.LOAD_MARKUPS.value;
        }

        cvApi.SetInitFlags(initFlags);

        session = cvApi.CreateSession(el.id);

        var canvasEl = el.querySelector('canvas[id*="' + el.id + '"]');
        if (canvasEl) {
          canvasEl.addEventListener('click', function(e) {
            if (session) {
              var offsetTop = getCanvasOffsetTop(canvasEl);
              session.DoUserPick(e.pageX, e.pageY - offsetTop, true, {
                  type: 'click',
                }, null, function() {}
              );
            }
          });
        }

        session.AllowPartSelection(false);
        session.SetDragMode(Module.DragMode.NONE);
        session.SetDragSnap(false);
        session.SetBackgroundColor(0xEEEEEEFF);
        session.ShowGnomon(false);
        session.SetNavigationMode(Module.NavMode.VUFORIA_NOPICK);
        session.AllowCameraApplications(false);
        session.SetZoomOnLoad(false);

        if (window.builderSettings.annotationsEnabled === true) {
          session.SetShapeFilters(0x7 | 0x00300000); // Turn on misc & planar annotations
        }

        if (window.builderSettings.antiAliasingEnabled === false) {
          session.SetAntialiasingMode(Module.AntialiasingMode.NONE);
        } else {
          session.SetAntialiasingMode(Module.AntialiasingMode.SS4X);
        }

        if (window.builderSettings.viewMode === "orthographic") {
          session.SetOrthographicProjection(1.0);
        } else {
          session.SetPerspectiveProjection(45);
        }
      }
    }

    if (cvApi) {
    }
    else {
      ThingView.init(thingViewPath, function () {
        //Preview renderer is ready
        cvApi = ThingView;
        cvApiReady();
      });
    }

    var vrSession = {};
    var widgetsToLoad = [];
    var shaders = [];
    var defaultShader = {};

    var VrSessionObj = (function (me, name, widget, type) {
      var _this = me || {};

      var mWidget = widget;
      var mType = type;

      _this.SetType = function (type) {
        mType = type;
      };

      _this.GetType = function () {
        return mType;
      };

      _this.SetWidget = function (widget) {
        mWidget = widget;
      };

      _this.GetWidget = function () {
        return mWidget;
      };

      return _this;
    });

    $rootScope.$on('loaded3DObj', function (event, args) {
      //Set properties after loading:

      var name = args.name;
      var obj = vrSession[name];
      var newLoad = false;

      if (obj) {
        applyProperties(obj);
        applyTransform(obj);
        applyColor(obj);
        let idx = widgetsToLoad.indexOf(name);
        if (idx > -1) {
          widgetsToLoad.splice(idx, 1);
          newLoad = true;
        }
      }

      if (obj.GetType() === 'Model') {

        var widget = obj.GetWidget();
        widget.AttachModelItems();

        for (var obj2 in vrSession) {
          if (vrSession[obj2].GetType() === 'Model Item') {
            if (vrSession[obj2].modelName === name) {
              var relativeidpath = vrSession[obj2].idpath.slice(vrSession[obj2].idpath.indexOf("/"));
              var modelItemWidget = vrSession[obj2].GetWidget();
              if (!modelItemWidget) {
                ctx.addModelItem(obj2);
                modelItemWidget = vrSession[obj2].GetWidget();
              }
              modelItemWidget.SetModelAndIdPath(widget, relativeidpath);
              modelItemWidget.loaded = true;
              let idx = widgetsToLoad.indexOf(obj2);
              if (idx > -1) {
                widgetsToLoad.splice(idx, 1);
                newLoad = true;
              }
              applyProperties(vrSession[obj2]);
              applyTransform(vrSession[obj2]);
              applyColor(vrSession[obj2]);
              applyTexture(vrSession[obj2]);
            }
          }
        }
      }

      if (widgetsToLoad.length === 0 && newLoad) {
        session.ZoomView(Module.ZoomMode.ZOOM_ALL, 0);
      }
    });

    $rootScope.$on('loadedSeqErr', function (event, args) {
      var name = args.name;
      var obj  = vrSession[name];
      if (obj) {
        setTimeout(obj.sequenceData.seqErrCB(), 0);
      }
    });

    $rootScope.$on('loadedSeq', function (event, args) {
      var name = args.name;
      var obj = vrSession[name];
      if (obj) {
        applySequence(obj);
      }
    });

    function getResourceUrl(objName, isResource) {
      var localPath = objName;
      if (isResource === true) {
        localPath = 'app/resources/' + objName;
      }
      var a = document.createElement('a');
      a.href = localPath;
      return a.href;
    }

    function addObj(name, widget, type) {
      var addition = VrSessionObj(undefined, name, widget, type);
      vrSession[name] = addition;
      widgetsToLoad.push(name);
      return addition;
    }

    function applyProperties(obj) {
      var widget = obj.GetWidget();
      if (widget !== undefined && widget.loaded && obj.properties !== undefined) {
        if (obj.properties.billboard !== undefined) {
          widget.SetBillboard(parseBool(obj.properties.billboard));
        }
        if (obj.properties.decal !== undefined) {
          widget.SetDecal(parseBool(obj.properties.decal));
        }
        if (obj.properties.hidden !== undefined) {
            widget.SetVisibility(!parseBool(obj.properties.hidden));
        }
        if (obj.properties.forceHidden !== undefined) {
          widget.SetForceHidden(parseBool(obj.properties.forceHidden));
        }
        if (obj.properties.shader !== undefined) {
          if (obj.properties.shader === "demo_highlight_on") {
            if (obj.GetType() === 'Image') {
              session.SelectMarker(widget, true);
            } else if (obj.GetType() === 'Model') {
              session.SelectModel(widget, true);
            } else if (obj.GetType() === 'Model Item') {
              session.SelectModelItem(widget, true);
            }
          }
          else if (obj.properties.shader === "demo_highlight_off") {
            if (obj.GetType() === 'Image') {
              session.SelectMarker(widget, false);
            } else if (obj.GetType() === 'Model') {
              session.SelectModel(widget, false);
            } else if (obj.GetType() === 'Model Item') {
              session.SelectModelItem(widget, false);
            }
          }
          else {
            // real shader stuff goes here
            applyShader(obj);
          }
        }

        if (obj.properties.experimentalOneSided !== undefined) {
            widget.SetSidedness(parseBool(obj.properties.experimentalOneSided) ? Module.Sidedness.SINGLE_SIDED : Module.Sidedness.DOUBLE_SIDED );
        }

        widget.ApplyOccludeOpacity(obj.properties.occlude, obj.properties.opacity);
        resizeFloor(session, floorsize, false);
      }
    }

    function applyTransform(obj) {
      var widget = obj.GetWidget();
      if (widget !== undefined && widget.loaded) {
        if (obj.rotation) {
          let rx = Number(obj.rotation.rx);
          let ry = Number(obj.rotation.ry);
          let rz = Number(obj.rotation.rz);
          if (isNaN(rx) || isNaN(ry) || isNaN(rz)) {
            let orientation =  widget.GetLocation().orientation;
            rx = isNaN(rx) ? orientation.x : rx;
            ry = isNaN(ry) ? orientation.y : ry;
            rz = isNaN(rz) ? orientation.z : rz;
          }
          widget.SetOrientation(rx, ry, rz);
        }
        if (obj.translation) {
          let x = Number(obj.translation.x);
          let y = Number(obj.translation.y);
          let z = Number(obj.translation.z);
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            let position =  widget.GetLocation().position;
            x = isNaN(x) ? position.x : x;
            y = isNaN(y) ? position.y : y;
            z = isNaN(z) ? position.z : z;
          }
          widget.SetPosition(x, y, z);
        }
        widget.ApplyScale(obj);
        resizeFloor(session, floorsize, false);
      }
    }

    function applyColor(obj) {
      var widget = obj.GetWidget();
      if (widget !== undefined && widget.loaded) {
        if (obj.rgb) {
          widget.SetColor(Number(obj.rgb[1]) / 255, Number(obj.rgb[2]) / 255, Number(obj.rgb[3]) / 255, 1.0);
        } else if (widget.UnsetColor) {
          widget.UnsetColor();
        }
      }
    }

    function applySequence(obj) {
      var widget = obj.GetWidget();
      if (widget !== undefined && widget.loaded) {
        var stepInfoVec = widget.stepInfoVec;
        setTimeout(obj.sequenceData.seqSuccCB({stepVec: stepInfoVec}), 0);
      }
    }

    function loadSequence(obj) {
      var widget = obj.GetWidget();
      if (obj.sequenceData.seqURL === "") {
        obj.GetWidget().LoadIllustrationWithCallback("", widget.IllustrationLoadedHandler);
      }
      else {
        var sequenceName = GetSequenceNamefromUrl(obj.sequenceData.seqURL, widget);
        if (sequenceName) {
          widget.LoadIllustrationWithCallback(sequenceName, widget.IllustrationLoadedHandler);
        }
        else {
          setTimeout(obj.sequenceData.seqErrCB, 0);
        }
      }
    }

    function applyShader(obj) {
      var widget = obj.GetWidget();
      if (widget !== undefined && obj.properties.shader !== undefined) {
        var shaderSettings = obj.properties.shader;
        var settings = shaderSettings.split(";"); //Split by ";"
        var shaderName = settings[0];
        var res = shaders.find(function(shader) {
          return shader.name === shaderName;
        });

        var shader;
        if (res) {
          shader = res.shader;
        } else if (shaderName === "Default") { //Insert default shader
          shader = defaultShader;
        }

        if (!shader) {
          widget.UnsetTMLShader();
        } else {
          widget.SetTMLShader(shader.fragment, shader.vertex, shader.name);
          obj.shader = shader.name;

          if (shaderName === "Default") {
            return;
          }
          //Set uniforms:

          settings.forEach(function(uniform) {
            uniform = uniform.trim(); // Trim any whitespace from beginning and end
            var uniformSettings = uniform.split(" "); //Split by " "
            var name = uniformSettings[0];
            var type = uniformSettings[1];
            var val  = uniformSettings[2];

            switch (type) {
              case "f":
                widget.SetTMLShaderFloat(name, Number(val));
                break;
              case "i":
                widget.SetTMLShaderInt(name, Number(val));
                break;
              case "b":
                widget.SetTMLShaderBool(name, Number(val));
                break;
              default:
                break;
            }
          }, widget);
        }
      }
    }

    function applyTexture(obj) {
      var widget = obj.GetWidget();
      if (widget !== undefined && widget.loaded) {
        if (obj.texture !== undefined) {
          ctx.setTexture(widget.name, obj.texture);
        }
      }
    }

    function setDefaultShader() {
      defaultShader.name = "Default";
      defaultShader.vertex = " \
      \
          attribute vec3 vertexPosition;\
          attribute vec3 vertexNormal;\
          attribute vec2 vertexTexCoord;\
      \
          varying vec2 texCoord;\
          varying vec3 normal;\
          varying vec3 vertex;\
      \
          uniform mat4 modelViewProjectionMatrix;\
          uniform mat4 normalMatrix;\
          uniform mat4 modelViewMatrix;\
      \
          void main() {\
      \
              gl_PointSize=40.0;\
              vec4 vp     = vec4(vertexPosition, 1.0);\
              gl_Position = modelViewProjectionMatrix * vp;\
              vertex      = vec3(modelViewMatrix * vp);\
              normal      = vec3(normalize(normalMatrix * vec4(vertexNormal,0.0)));\
              texCoord    = vertexTexCoord;\
          }\
      ";

      defaultShader.fragment = "\
      \
          precision mediump float;\
          varying vec3 vertex;\
          varying vec3 normal;\
          varying vec2 texCoord;\
          uniform bool  twoSided;\
          uniform bool  lightingEnabled;\
          uniform bool  useTexture;\
          uniform int   primitiveType;\
          uniform vec4  surfaceColor;\
          uniform float transparency;\
          uniform sampler2D texSampler2D;\
          const vec3 lightPos     = vec3(0.633724272, 0.443606973, 0.633724272);\
          const vec4 ambientColor = vec4(0.1, 0.1, 0.1, 1.0);\
          const vec4 specColor    = vec4(1.0, 1.0, 1.0, 0.0);\
          void main(void)  {\
              vec4 color = surfaceColor;\
              if (primitiveType==0) {\
                  color = texture2D(texSampler2D, gl_PointCoord);\
              } else if(primitiveType==1 || primitiveType==3) {\
              } else {\
                  if (useTexture) {\
                    color = texture2D(texSampler2D, texCoord);\
                  }\
                  if (lightingEnabled) {\
                      vec3 lightDir = -(lightPos);\
                      vec3 finalNormal = normalize(normal);\
                      float lambertian = dot(lightDir,finalNormal);\
                      float specular = 0.0;\
                      vec3 viewDir = normalize(-vertex);\
                      if (twoSided && lambertian < 0.0) {\
                          lambertian = -lambertian;\
                          finalNormal = -finalNormal;\
                      }\
                      if (lambertian > 0.0) {\
                          vec3 reflectDir = reflect(-lightDir, finalNormal);\
                          float specAngle = max(dot(reflectDir, viewDir), 0.0);\
                          specular = pow(specAngle, 4.0);\
                      }\
                      color = ambientColor * color +\
                              color        * vec4(lambertian,lambertian,lambertian,0.0) +\
                              specColor    * specular;\
                  }\
              }\
              color.a = color.a * transparency;\
              gl_FragColor = color;\
          }\
      ";
    }

    this.GetObject = function (name) {
      var sessionObj = vrSession[name];
      if (sessionObj === undefined) {

        var arr = name.split("/", 1);
        if (arr[0].endsWith("-") && arr[0].length > 1) {
          this.addModelItem(name);
        }
        else {
          addObj(name, undefined, undefined);
        }
        sessionObj = vrSession[name];
      }
      return sessionObj;
    };

    this.addPVS = function (name, id, url, cull, parent, successCb, errorCb) {
      if (session) {
        if (url === undefined) {
          console.debug('Aborting addPVS: No resource specified');
          setTimeout(errorCb, 0);
          return;
        }
        if (!this.isResourceUrlFullyQualified(url)) {
          url = getResourceUrl(url);
        }

        let widget = session.MakeModel();

        widget.loaded = false;
        widget.stepInfoVec = [];
        widget.detachedModelItems = [];

        // UserPick Callback
        widget.SetUserPickCallback(function(userData, idPath) {
          if (userData.type === "click") {
            window.twx.widgetClickCallback(widget.name, 'twx-dt-model', idPath);
          }
        });

        // Load Function
        widget.LoadModel = function(url) {
          widget.LoadFromURLWithCallback(url, true, false, false, widget.ModelLoadedHandler);
        };

        // Model Loaded Callback
        widget.ModelLoadedHandler = function(success, isStructure, errors) {
          if (!success) {
            return;
          }
          if (isStructure) {
            var box = widget.CalculateBoundingBox(new Module.VectorString());
            if (box.valid) {
              widget.loaded = true;
              $rootScope.$broadcast('loaded3DObj', { name: widget.name });
            }
          }
          else {
            if (!widget.loaded) {
              widget.loaded = true;
              $rootScope.$broadcast('loaded3DObj', { name: widget.name });
            }
            var obj = vrSession[widget.name];
            if (obj.sequenceData) {
              loadSequence(obj);
            }
          }
        };

        // Illustration Loaded Callback
        widget.IllustrationLoadedHandler = function(success, name, TVstepInfoVec) {
          if (success) {
            widget.stepInfoVec = [];
            for (var i = 0; i < TVstepInfoVec.size(); i++) {
              var TVstepInfo = TVstepInfoVec.get(i);
              var stepInfo = {
                acknowledge: TVstepInfo.acknowledge,
                duration: TVstepInfo.duration,
                name: TVstepInfo.name
              };

              widget.stepInfoVec.push(stepInfo);
            }
            $rootScope.$broadcast('loadedSeq', { name: widget.name });
          }
          else {
            $rootScope.$broadcast('loadedSeqErr', { name: widget.name });
          }
        };

        // Sequence Event Callback
        widget.SetSequenceEventCallback(function(playState, stepInfo, playPosition)  {
          var eventInfo = {
            stepNumber: stepInfo.number,
	          stepName: stepInfo.name,
            stepDescription: stepInfo.description,
            duration: stepInfo.duration,
            acknowledge: stepInfo.acknowledge,
            acknowledgeMessage: "",
            totalSteps: stepInfo.totalSteps,
            nextStep: stepInfo.number + 1
          };

          if (playState === Module.SequencePlayState.STOPPED) {
            if (!stepPlaying) { // don't ack on forward/back/reset
              eventInfo.acknowledge = false;
            }
            stepPlaying = false;

            if (playPosition === Module.SequencePlayPosition.END) {
              if (stepInfo.number === stepInfo.totalSteps - 1) {
                eventInfo.nextStep = -1;
              } else {
                eventInfo.nextStep = stepInfo.number + 1;
              }
            }
            else {
              eventInfo.nextStep = stepInfo.number;
            }

            $rootScope.$broadcast('stepcompleted', widget.name, 'twx-dt-model', JSON.stringify(eventInfo));
          }
          else if (playState === Module.SequencePlayState.PLAYING) {
            stepPlaying = true;
            $rootScope.$broadcast('stepstarted', widget.name, 'twx-dt-model', JSON.stringify(eventInfo));
          }
        });

        // Apply Scale Function
        widget.ApplyScale = function (obj) {
          let scale = Number(obj.scale.sx);
          if (!isNaN(scale)) {
            widget.SetScale(scale);
          }
        };

        // Apply Occlude and Opacity Values Function
        widget.ApplyOccludeOpacity = function (occlude, opacity) {
          if (occlude !== undefined && parseBool(occlude)) {
            widget.SetRenderMode(Module.RenderMode.OCCLUDING, 0);
          } else if (opacity !== undefined) {
            if (opacity < 1.0) {
              widget.SetRenderMode(Module.RenderMode.PHANTOM, Number(opacity));
            } else {
              widget.SetRenderMode(Module.RenderMode.SHADED, 0);
            }
          }
        };

        // Attach Model Items Function
        widget.AttachModelItems = function () {
          var i = this.detachedModelItems.length;
          while (i--) {
            var item = this.detachedModelItems[i];
            if (item.props.modelName === this.name) {
              ctx.addModelItem(item.name);
              var widgetObj = ctx.GetObject(item.name);
              let idx = widgetsToLoad.indexOf(item.name);
              if (idx > -1) {
                widgetsToLoad.splice(idx, 1);
              }
              widgetObj.properties = item.props.properties;
              widgetObj.rgb = item.props.rgb;
              widgetObj.rotation = item.props.rotation;
              widgetObj.scale = item.props.scale;
              widgetObj.translation = item.props.translation;
              this.detachedModelItems.splice(i, 1);
            }
          }
        };

        // Detach Model Items Function
        widget.DetachModelItems = function () {
          for (var sessionObj2 in vrSession) {
            if (vrSession[sessionObj2].GetType() === 'Model Item') {
              if (vrSession[sessionObj2].modelName === this.name) {
                var modelItemWidget = vrSession[sessionObj2].GetWidget();
                vrSession[sessionObj2].SetWidget(undefined);
                this.detachedModelItems.push({ name: sessionObj2, props: vrSession[sessionObj2] });
                delete vrSession[sessionObj2];
                session.RemoveModelItemPtr(modelItemWidget, true);
              }
            }
          }
        };

        widget.name = id;
        session.AddModel(widget);

        var obj = vrSession[id];
        if (!obj) {
          obj = addObj(id, widget, 'Model');
        }
        else {
          obj.SetWidget(widget);
          obj.SetType('Model');
        }

        widget.LoadModel(url);

        setTimeout(successCb, 0);
        return widget;
      }
    };

    this.setModelURL = function (modelParams, successCb, errorCb) {
      var sessionObj = this.GetObject(modelParams.modelID);
      if (sessionObj !== undefined && sessionObj.GetType() === 'Model') {
        var widget = sessionObj.GetWidget();
        if (widget !== undefined) {
          widget.DetachModelItems();
          widgetsToLoad.push(modelParams.modelID);
          widget.LoadModel(modelParams.modelURL);
          setTimeout(successCb, 0);
        }
      }
    };

    this.loadPVI = function (pviParams, successCb, errorCb) {
      if (session)
      {
        var sessionObj = this.GetObject(pviParams.modelID);
        if (sessionObj !== undefined && sessionObj.GetType() === 'Model') {
          var widget = sessionObj.GetWidget();
          if (widget !== undefined) {
            sessionObj.sequenceData = {
              seqSuccCB: successCb,
              seqErrCB:  errorCb,
              seqURL:    pviParams.url
            };

            if (widget.loaded) {
              loadSequence(sessionObj); // triggers success/error callback
            }
          }
        }
      }
    };

    this.playStep = function (playParams, successCb, errorCb) {
      if (session) {
        var sessionObj = this.GetObject(playParams.modelID);
        if (sessionObj !== undefined && sessionObj.GetType() === 'Model') {
          var widget = sessionObj.GetWidget();
          if (widget !== undefined && playParams.stepNumber <= widget.stepInfoVec.length) {
            widget.GoToSequenceStep(Number(playParams.stepNumber), Module.SequencePlayPosition.START, true);
            setTimeout(successCb, 0);
          } else {
            setTimeout(errorCb, 0);
          }
        }
      }
    };

    this.gotoStep = function (gotoParams, successCb, errorCb) {
      if (session) {
        var sessionObj = this.GetObject(gotoParams.modelID);
        var widget = sessionObj.GetWidget();

        if (sessionObj !== undefined && sessionObj.GetType() === 'Model') {

          if ((gotoParams.stepNumber === 0) ||
            (gotoParams.stepNumber === 1 && !widget.stepInfoVec[0].acknowledge)) {
            widget.StopAnimation();
          }

          var position = Module.SequencePlayPosition.START;
          if (gotoParams.position === 'end') {
            position = Module.SequencePlayPosition.END;
          }

          if (widget !== undefined && gotoParams.stepNumber <= widget.stepInfoVec.length) {
            widget.GoToSequenceStep(Number(gotoParams.stepNumber), position, false);
            setTimeout(successCb, 0);
          } else {
            setTimeout(errorCb, 0);
          }
        }
      }
    };

    this.add3DImage = function (trackerName, name, image, parent, lx, ly, anchor, width, height, pivot, successCb, errorCb) {
      if (session) {

        //Marker has already been added:
        var recognizer = image.split(' ');
        if (recognizer.length === 2) {
          if (recognizer[0].includes('recognised') && recognizer[1].includes('recognised2')) {
            return;
          }
        }

        var widget = session.MakeImageMarker();
        widget.name = name;

        var obj = vrSession[name];
        if (!obj) {
          obj = addObj(name, widget, 'Image');
        }
        else {
          obj.SetWidget(widget);
          obj.SetType('Image');
        }
        obj.width = width;
        obj.height = height;

        // LoadNonNativeImage Function
        widget.LoadNonNativeImage = function (url) {
          var image = new Image();
          image.onerror = function(e) {
            console.error('Could not load image.', e, url);
          };
          image.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.height = image.height;
            canvas.width = image.width;
            var context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            var nDataBytes = imageData.data.length * imageData.data.BYTES_PER_ELEMENT;
            var dataBytes = Module._malloc(nDataBytes);
            var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataBytes, nDataBytes);
            dataHeap.set(new Uint8Array(imageData.data.buffer));
            widget.SetImage(dataHeap.byteOffset, imageData.width, imageData.height);
            Module._free(dataHeap.byteOffset);
            widget.loaded = true;
            $rootScope.$broadcast('loaded3DObj', { name: widget.name });
          };
          if(url && url.startsWith('http')) {
            image.crossOrigin = "Anonymous";
          }
          image.src = url;
        };

        // LoadFromURL Function
        widget.LoadFromURL = function (url) {
          widget.LoadNonNativeImage(url);
        };

        // UserPick Callback
        widget.SetUserPickCallback(function(userData) {
          if (userData.type === "click") {
            window.twx.widgetClickCallback(widget.name, '3DImage');
          }
        });

        // Apply Scale Function
        widget.ApplyScale = function (obj) {
          if (Number(obj.width) > 0 && Number(obj.height) > 0) {
            widget.LockAspectRatio(false);
            widget.SetHeight(Number(obj.height));
            widget.SetWidth(Number(obj.width));
          }
          else if (Number(obj.width) > 0) {
            widget.LockAspectRatio(true);
            widget.SetWidth(Number(obj.width));
          }
          else if (Number(obj.height) > 0) {
            widget.LockAspectRatio(true);
            widget.SetHeight(Number(obj.height));
          }
          else {
            widget.LockAspectRatio(true);
            widget.SetHeight(Number(this.GetNativeHeight()));
          }
          if (obj.scale && Number(obj.scale.sx) > 0 && Number(obj.scale.sy) > 0) {
            widget.SetScaleWidth(Number(obj.scale.sy));
            widget.SetScaleHeight(Number(obj.scale.sy));
          }
          else {
            widget.SetScaleWidth(1.0);
            widget.SetScaleHeight(1.0);
          }
        };

        // Apply Occlude and Opacity Values Function
        widget.ApplyOccludeOpacity = function (occlude, opacity) {
          if (occlude !== undefined) {
            widget.SetOccluding(parseBool(occlude));
          }
          if (opacity !== undefined) {
            widget.SetOpacity(Number(opacity));
          }
        };

        this.setTexture(name, image);

        if (pivot !== undefined) {
          const anchors = [
            Module.AnchorType.TOP_LEFT,    Module.AnchorType.TOP_CENTER,    Module.AnchorType.TOP_RIGHT,
            Module.AnchorType.MIDDLE_LEFT, Module.AnchorType.MIDDLE_CENTER, Module.AnchorType.MIDDLE_RIGHT,
            Module.AnchorType.BOTTOM_LEFT, Module.AnchorType.BOTTOM_CENTER, Module.AnchorType.BOTTOM_RIGHT
          ];
          widget.SetAnchor(anchors[pivot-1]);
        }
      }
      else {
        setTimeout(errorCb, 0);
      }

      setTimeout(successCb, 0);
    };

    this.addModelItem = function (name) {
      var arr = name.split("/", 1);
      if (arr[0].endsWith("-") && arr[0].length > 1) {
        var modelName = arr[0].slice(0, arr[0].length - 1);

        var obj = vrSession[name];
        if (!obj) {
          obj = addObj(name, undefined, 'Model Item');
          obj.idpath = name;
          obj.modelName = modelName;
        }

        if (session) {
          var widget = session.MakeModelItem();
          obj.SetWidget(widget);

          // UserPick Callback
          widget.SetUserPickCallback(function(userData, idPath) {
            if (userData.type === "click") {
              // the parent twx-dt-model is the element to pass along to the native event handler
              window.twx.widgetClickCallback(widget.parentModelId, 'twx-dt-model', idPath);
            }
          });

          // Apply Scale Function
          widget.ApplyScale = function (obj) {
              widget.SetScale(Number(obj.scale.sx));
          };

          // Apply Occlude and Opacity Values Function
          widget.ApplyOccludeOpacity = function (occlude, opacity) {
            if (occlude !== undefined && parseBool(occlude)) {
              widget.SetRenderMode(Module.RenderMode.OCCLUDING, 0);
            } else if (opacity !== undefined) {
              if (opacity < 1.0) {
                widget.SetRenderMode(Module.RenderMode.PHANTOM, Number(opacity));
              } else {
                widget.SetRenderMode(Module.RenderMode.SHADED, 0);
              }
            }
          };

          widget.name = name;
          widget.parentModelId = modelName;
          widget.idPath = name.slice(name.indexOf("/"));

          var modelObj = vrSession[modelName];
          if (modelObj !== undefined) {
            var modelWidget = modelObj.GetWidget();
            if (modelWidget !== undefined && modelWidget.loaded) {
              widget.SetModelAndIdPath(modelWidget, widget.idPath);
              widget.loaded = true;
            }
          }
        }
      }
    };

    this.addGroup = function (name, id, cull, parent, successCb, errorCb) {
      if (session) {
        var views = document.querySelectorAll('twx-dt-view');
        if (views && views.length) {
          var view = views[views.length - 1];
          var element = view.querySelector("#" + id);
          if (element !== undefined && element !== null) {
            var src = element.getAttribute('src');
            if (src !== undefined && src !== null) {
              this.addPVS(name, id, src, cull, parent, successCb, errorCb);
            }
          }
        }
      }
    };

    this.setupAREventsCommand = function () {
      if (session) {
      }
    };

    this.setupTrackingEventsCommand = function (callback) {
      if (!session) {
        console.error("Wasn't able to setupTrackingEventsCommand because session object is not available.");
        return;
      }

      session.SetCameraMoveCallback(location => {
        let orientation = location.orientation;
        let position = location.position;
        let euler = new THREE.Euler(THREE.Math.degToRad(orientation.x), THREE.Math.degToRad(orientation.y), THREE.Math.degToRad(orientation.z), "ZYX");
        let gaze = new THREE.Vector3(0, 0, -1).applyEuler(euler);

        let worldUp = new THREE.Vector3(0, 1, 0);
        let right = new THREE.Vector3().crossVectors(gaze, worldUp);
        let up = new THREE.Vector3().crossVectors(right, gaze).normalize();

        this._getTracked().forEach(tracked => {
          // Each tracker receives camera coordinates in world space - it only makes sense for a single tracker per view.
          let trackerId = tracked.getAttribute("id");
          callback(trackerId, [position.x, position.y, position.z], gaze.toArray(), up.toArray());
        });
      });
    };

    this.addEmitter = function (name,
      id,
      particles,
      radius,
      velocity,
      decay,
      gravity,
      spread,
      size,
      mass,
      rate,
      wind,
      blend,
      color,
      texture,
      parent,
      successCb,
      failureCb) {
      setTimeout(successCb, 0);
    };

    /**
     * @param {string} name - named of tracker, such as 'tracker1'
     * @param {string} id - id of target, such as 'thingMark-1'
     * @param {string} src - src of target, such as 'vuforia-vumark:///vumark?id='
     *                          or 'vuforia-image:///app/resources/Uploaded/DB2?id=T1'
     *                          or 'spatial://'
     * @param {string} width - width of target, such as '0.0254'
     * @param {function} successCb success callback func
     * @param {function} errorCb error callback func
     */
    this.addMarker = function (name, id, src, width, successCb, errorCb) {
      if (session) {
        let guideURL;

        if (src.startsWith("vuforia-vumark://")) {
          // Don't use the guide specified for thingmarks; use the placeholder instead.
          guideURL = "/extensions/images/placeholder_thingmark.png";
        }
        else if (src.startsWith("spatial://")) {
          // Spatial targets don't have a guide, use a hardcoded placeholder.
          guideURL = "/extensions/images/placeholder_spatial.svg";
        }
        else if (src.startsWith("vuforia-model://")) {
          // Replace the model target image with a placeholder in preview (DT-16624)
          guideURL = "/extensions/images/placeholder_model_target.svg";
        }
        else if (this._experienceDefinedTargets && this._experienceDefinedTargets[id] && this._experienceDefinedTargets[id].guide) {
          guideURL = this._experienceDefinedTargets[id].guide;
        }
        else {
          console.error("No placeholder available for the twx-dt-target [" + id + "]");
          setTimeout(successCb, 0);
          return;
        }

        if(src.startsWith("vuforia-model://")) {
          var self = this;
          $rootScope.$on('loaded3DObj', function (evt, data) {
            // when the Model Target is loaded, put the placeholder image on the floor
            if(data && data.name === id) {
              self.setRotation(id, -90);
              self.setTranslation(id, undefined, floorsize.pos.y, undefined);
            }
          });

        }
        this.add3DImage(name, id, guideURL, undefined, undefined, undefined, undefined, width, undefined, undefined, successCb, errorCb);
      }
      else {
        console.error("addMarker called before session was available.");
        setTimeout(successCb, 0);
      }
    };

    /**
     * @param {Object} params
     * @param {string} params.tracker - The id of the tracker
     * @param {string} params.target - The id of the target
     * @param {string} params.src - The URL of the image for this guide
     * @param {function} successCb success callback func
     * @param {function} errorCb error callback func
     */
    this.addTargetGuide = function(params, successCb, errorCb) {
      if (params.tracker && params.src && params.target) {
        // Cache the guide src so it can be used in addMarker.
        if (this._experienceDefinedTargets === undefined) {
          this._experienceDefinedTargets = {};
        }

        this._experienceDefinedTargets[params.target] = { guide: params.src };
      }

      setTimeout(successCb, 0);
    };

    this.addTracker = function (name, successCb, errorCb) {
      setTimeout(successCb, 0);
    };

    this.loadTrackerDef = function (marker, successCb, errorCb) {
      if (session) {
        if (successCb) {
          setTimeout(successCb, 0);
        }
      }
      else {
        setTimeout(errorCb, 0);
      }
    };

    this.initializeAR = function (license, maxtrackers, extendedtracking, persistmap, near, far, successCb, errorCb) {
      if (!cvApi) {
        var that = this;
        setTimeout(function () {
          that.initializeAR(license, maxtrackers, extendedtracking, persistmap, near, far, successCb, errorCb);
        }, 50);
        return;
      }

      cvApiReady();
      resizeFloor(session, floorsize, false);
      setDefaultShader();

      $timeout(successCb, 0, false);
    };

    this.cleanUpAndPause = function (successCallback, errorCallback) {
      if (session) {
        Object.keys(vrSession).forEach(function(sessionObjName) {
          var sessionObj = vrSession[sessionObjName];
          var widget = sessionObj.GetWidget();
          var type = sessionObj.GetType();

          if (type === 'Model') {
            session.RemoveModelPtr(widget);
          } else if (type === 'Model Item') {
            session.RemoveModelItemPtr(widget, true);
          } else {
            session.DeleteImageMarker(widget);
          }

          widget = undefined;
          sessionObj.SetWidget(widget);
          floorsize = { size: 0, pos: { x: 0, y: 0 } };
        });

        cvApi.DeleteSession(session);
        session = undefined;
      }

      Object.keys(vrSession).forEach(function(sessionObj) {
        delete vrSession[sessionObj];
      });

      setTimeout(successCallback, 0);
    };

    this.isResourceUrlFullyQualified = function isResourceUrlFullyQualified(src) {
      if (!src) {
        return false;
      }
      return (src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("file://") ||
      src.startsWith("data:"));
    };

    this.setTexture = function (name, src) {
      if (session && src) {
        var rscUrl = src;
          if (!this.isResourceUrlFullyQualified(src)) {
            rscUrl = getResourceUrl(src);
          }
          var sessionObj = vrSession[name];
          if (sessionObj !== undefined) {
            var widget = sessionObj.GetWidget();
            if (widget !== undefined) {
              var type = sessionObj.GetType();

              if (type === 'Model Item') {
                if (widget.loaded !== true) {
                  sessionObj.texture = src;
                  return;
                }
              }

              if (rscUrl.startsWith("data:image/png;base64,")) {
                if (type === 'Image') {
                  widget.SetTMLShaderImageFromBase64("texSampler2D", rscUrl);
                  widget.LoadFromBase64WithCallback(rscUrl.slice(22), function(success) {
                    if (success) {
                      widget.loaded = true;
                      $rootScope.$broadcast('loaded3DObj', { name: widget.name });
                    }
                  });
                }
                else if (type === 'Model') {
                  widget.SetTMLShaderImageFromBase64("texSampler2D", rscUrl);
                  widget.SetTextureFromBase64Bool(rscUrl.slice(22), Module.Wrap.CLAMP);
                }
              }
              else if (rscUrl.startsWith("data:image") && type === 'Image') {
                  widget.LoadNonNativeImage(rscUrl); // can only set image like this for now, not shader textures.
              }
              else {
                var urls = src.split(" ");
                var bSetImageFromURL = false;

                for (var i = 0; i < urls.length; i++) {
                    var url = urls[i];
                    if (!this.isResourceUrlFullyQualified(url)) {
                      url = getResourceUrl(url);
                    }

                    var urlInfo = session.ParseURL(url);
                    var protocol = urlInfo.protocol;
                    var params = urlInfo.params;

                    if (protocol === "http" || protocol === "https" || protocol === "file") {

                      var textureName = "texSampler2D";
                      if (i > 0) {
                        textureName += i;
                      }
                      var param = params.get("name");
                      if (param) {
                        textureName = param;
                      }

                      if (!bSetImageFromURL) {
                          bSetImageFromURL = true;

                          var wrap = Module.Wrap.CLAMP;
                          param = params.get("edge");
                          if (param === "repeat") {
                            wrap = Module.Wrap.REPEAT;
                          } else if (param === "mirror") {
                            wrap = Module.Wrap.MIRROR;
                          }

                          if (type === 'Image') {
                            widget.LoadFromURL(url);
                          } else if (type === 'Model Item') {
                            widget.SetTextureFromURL(url, wrap);
                          }
                      }

                      if (type === 'Image') {
                        widget.SetTMLShaderImage(textureName, url);
                      } else if (type === 'Model Item') {
                        widget.SetTMLShaderImage(textureName, url);
                      }
                    }
                }
              }
            }
          }
          resizeFloor(session, floorsize, false);
      }
    };

    this.setVertices = function (id, vertices) {
    };

    this.setColor = function (name, color) {
      var sessionObj = this.GetObject(name);
      if (sessionObj !== undefined) {
        var rgb = color ? color.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i) : null;
        sessionObj.rgb = rgb;
        applyColor(sessionObj);
      }
    };

    this.setRotation = function (name, rx, ry, rz) {
      var sessionObj = this.GetObject(name);
      if (sessionObj !== undefined) {
        sessionObj.rotation = {rx: rx, ry: ry, rz: rz};
        applyTransform(sessionObj);
      }
    };

    this.setTranslation = function (name, x, y, z) {
      var sessionObj = this.GetObject(name);
      if (sessionObj !== undefined) {
        sessionObj.translation = {x: x, y: y, z: z};
        applyTransform(sessionObj);
      }
    };

    this.setScale = function (name, x, y, z) {
      var sessionObj = this.GetObject(name);
      if (sessionObj !== undefined) {
        sessionObj.scale = {sx: x, sy: y, sz: z};
        applyTransform(sessionObj);
      }
    };

    this.setProperties = function (name, props) {
      var sessionObj = this.GetObject(name);
      if (sessionObj !== undefined) {
        sessionObj.properties = props;
        applyProperties(sessionObj);
      }
    };

    this.setShader = function (name, vertex, fragment) {
        var shader = shaders.find(function(shader) {
          return shader.name === name;
        });

        if (shader) {
          shader.vertex   = vertex;
          shader.fragment = fragment;
        }
        else {
          shaders.push({name: name, shader: { name: name, vertex: vertex, fragment: fragment }});
        }
    };

    this.getTracked = function (successCb) {
      setTimeout(() => successCb(this._getTracked()));
    };

    this._getTracked = function () {
      // Assuming that in preview we are able to track all trackers at all times.
      return document.querySelectorAll("twx-dt-tracker");
    };

    this.lockCameraAndOrientation = function() {
      console.log('camera locked');
    };

    this.unlockCameraAndOrientation = function() {
      console.log('camera unlocked');
    };

    /** for unit testing only */
    this._setSession = function(_session) {
      session = _session;
    };

    return this;
  }

  /*********************************************************************************/

  twxWidgets.directive('twxDt3dView', twxDt3dView);
  twxWidgets2.directive('twxDt3dView', twxDt3dView);

  function addTwxCallbacks() {
    if (window.twx) {
      /**
       * Calls the same event handler that is used by View so Preview will have same events and event data
       * @param {string} widgetId the widget's id such as 'model-1' or '3DImage-1'
       * @param {string} targetType the targetType expected by the native event handler (either 'twx-dt-model' or '3DImage')
       * @param {string} itemIdPath the clicked idPath for model widget such as '0/1/2', or undefined for 3DImage
       */
      window.twx.widgetClickCallback = function (widgetId, targetType, idPath) {
        if (widgetId) {
          var evtData = idPath ? JSON.stringify({occurrence: idPath}) : undefined;
          VF_ANG.nativeEventHandler('userpick', widgetId, targetType, evtData);
        }
      };
    }
  }

  /**
   * Returns object of the form:
   * {
   *   project
   *   resource
   *   dir
   * }
   * @param str
   */
  function parseResourceStringForSmap(str) {
    let lessIndex = 1;
    if (str.endsWith('/')) {
      lessIndex = 2;
    }
    const splits = str.split('/');
    const res = splits[splits.length-lessIndex];
    return {
      project: splits[1],
      resource: res,
      dir: res.substring(0,res.lastIndexOf('.bin'))
    };
  }

  function twxDt3dView($rootScope, $timeout, $window) {
    var cvApi;

    var linker = function (scope, element, attrs) {

      var ctrl = scope.ctrl;
      element.data('ctrl', ctrl);
      $rootScope.$broadcast('start-load-spinner');

      var parent = element[0].parentElement;
      parent.setAttribute('style', 'position: absolute; width: 100%; height: 100vh; top: 0px; left: 0px;');

      var id = parent.getAttribute("widget-id") + "-controller";
      element.attr('id', id);
      element.attr('style', 'position: inherit; width: 100%; height: 100%;');

      if (cvApi) {
        ctrl.cvApiReady();
      }
      else {
        // the first argument is the relative path under studio/dist/client where the thingview library resides
        ThingView.init("extensions", function () {
          cvApi = ThingView;
          ctrl.cvApiReady();
        });
      }

      function clickListener(event) {
        // deselect any current active widgets
        var canvasContents = element.closest('#canvas-contents');
        canvasContents.find('[twx-widget]').removeClass('active');

        event.stopPropagation();
      }
      //Redraw labels when the css changes
      function cssChangeListener(event) {
         var redrawFunction = function(el) {
          var ctrl = angular.element(el).data('_widgetController');
          if (ctrl && ctrl.$cvWidget) {
            GenerateMarkupImage(ctrl.$cvWidget, ctrl.designPropertyValues());
          }
        };
        document.querySelectorAll('twx-dt-label').forEach(redrawFunction);
        document.querySelectorAll('twx-dt-image').forEach(redrawFunction);
      }

      var docEl = angular.element(document.head);
      docEl.off('cssChanged', cssChangeListener);
      docEl.on('cssChanged', cssChangeListener);
      element.off('click', clickListener);
      element.on('click', clickListener);

      scope.$on('$destroy', function() {
        element.off('click', clickListener);
      });

      if ($window.twx) {
        $window.twx.widgetSelectCallback = function(widgetId, resolve, reject) {
          if (widgetId) {
            resolve( $('[widget-id="' + widgetId + '"]')[0]);

          }
          else {
            reject('No widget-id found');
          }
        };

        $window.twx.get3DWidgetIdAtPoint = function(x, y) {
          var selectPromise = new Promise(function (resolve, reject) {
            ctrl.mySession.DoUserPick(x, y, true, { type: "data-bind-drop", resolveFn: resolve, rejectFn: reject }, null, function () {
              $window.twx.widgetSelectCallback('', resolve, reject);
            });
          });
          return selectPromise;
        };

        /**
         * Set hover drag styling,
         * @param x mouse coordinate
         * @param y mouse coordinate
         * @param isDataBindHover:  Boolean:  true for databind drag, false for new widget drag
         */
        $window.twx.set3DDragHoverAt = function(x, y, isDataBindHover){
          if (isDataBindHover) {
            ctrl.mySession.DoUserPick(x, y, true, { type: "data-bind-hover" }, null, function () {
              ctrl.mySession.DePreselectAll();
            });
          }
        };

        $window.twx.clear3DDragHover = function() {
          if (ctrl.mySession) {
            ctrl.mySession.DePreselectAll();
          }
        };
      }
    };

    return {
      scope: {},
      link: linker,
      controllerAs: 'ctrl',
      bindToController: true,
      controller: function ($scope, $element, $http) {
        var ctrl = this;
        ctrl.element = $element[0];
        ctrl.myWidgets = {};
        ctrl.mySession = undefined;
        ctrl.currentMode = 'authoring';
        ctrl.hiddenComponents = [];
        ctrl.reposMode = 'none';
        ctrl.floorsize = { size: 0, pos: { x: 0, y: 0 } };
        ctrl.detachedModelItems  = [];
        ctrl.detachedHiddenItems = [];

        ctrl.init = function () {
        };

        ctrl.getWidgetFactory = function (widgetTag) {
          var stdFactories = {
            'twx-dt-model': ctrl.addModel,
            'twx-dt-target': ctrl.addImageMarker,
            'twx-dt-target-image': ctrl.addImageMarker,
            'twx-dt-target-spatial': ctrl.addImageMarker,
            'twx-dt-target-user-defined': ctrl.addImageMarker,
            'twx-dt-target-model': ctrl.addModelTarget,
            'twx-dt-image': ctrl.addImageMarker,
            'twx-dt-label': ctrl.addTextMarker,
            'twx-dt-sensor': ctrl.addComboMarker,
            'twx-dt-modelitem': ctrl.addModelItem,
            'twx-dt-spatial-map': ctrl.addSpatialMap
          };
          var factory = stdFactories[widgetTag];
          if (!factory) {
            factory = ctrl.addCustomWidget;
          }
          return factory;
        };

        ctrl.createObject = function (ctrlWidget, originalDropOffset) {
          var tagName = ctrlWidget.getWidgetTagName();
          if (ctrl.getWidgetFactory(tagName) !== undefined) {
            ctrl.myWidgets[ctrlWidget.widgetId] = ctrlWidget;
            if (ctrl.mySession) {
              ctrl.mySession.DeselectAll();
              ctrlWidget.$cvWidget = ctrl.getWidgetFactory(tagName)(ctrlWidget, originalDropOffset);
            }
          }
        };

        ctrl.removeObject = function (ctrlWidget, removeOptions) {
          if (ctrlWidget && ctrl.myWidgets[ctrlWidget.widgetId]) {
            selectedWidget = ctrlWidget;
            if (ctrl.mySession) {
              ctrl.mySession.DeselectAll();
            }

            if (ctrlWidget.$cvWidget && ctrlWidget.$cvWidget.isCustomWidget) {
              ctrlWidget.$cvWidget.children.forEach(function(child) {
                let tagName = child.getWidgetTagName();
                if (tagName === "twx-dt-image" || tagName === "twx-dt-label") {
                  ctrl.mySession.DeleteImageMarker(child.$cvWidget);
                }
                else if (tagName === "twx-dt-model") {
                  ctrl.mySession.RemoveModelPtr(child.$cvWidget);
                }
                child.mutationObserver.disconnect();
                child.$cvWidget.delete();
                child.$cvWidget = null;
              });
              return;
            }

            var tagName = ctrlWidget.getWidgetTagName();

            if (tagName === 'twx-dt-model') {
              if (ctrl.mySession && ctrlWidget.$cvWidget) {
                ctrl.mySession.RemoveModelPtr(ctrlWidget.$cvWidget);
              }
              ctrl.removeHiddenParts(ctrlWidget); $scope.$applyAsync();
              if (ctrlWidget.$cvWidget) {
                // the remove options allow us to know when we are doing a "soft remove" (i.e. just cleaning up the canvas when switching views)
                // vs. an actual remove of the widget.  There could be listeners attached that are performing some cleanup
                // when a widget is removed so we need to pass these params into the remove() function on the widget
                var _removeOptions = Object.assign({notify: true, removePermanently: true}, (typeof removeOptions === 'object' ? removeOptions : {}));
                var i = ctrlWidget.$cvWidget.modelItems.length - 1;
                for (; i >= 0; i--) {
                  ctrlWidget.$cvWidget.modelItems[i].ctrlWidget.remove(_removeOptions.notify, _removeOptions.removePermanently);
                }

                // When a model is removed, remove corresponding model target also
                if (ctrlWidget.modelTarget) {
                  ctrlWidget.modelTarget.ctrlWidget.remove(_removeOptions.notify, _removeOptions.removePermanently);
                }
              }
            }
            else if (tagName === 'twx-dt-modelitem') {
              if (ctrl.mySession && ctrlWidget.$cvWidget) {
                ctrl.mySession.RemoveModelItemPtr(ctrlWidget.$cvWidget, true);
              }
              ctrl.removeHiddenParts(ctrlWidget); $scope.$applyAsync();
              var model = ctrl.myWidgets[ctrlWidget.designPropertyValues().model];
              if (model && model.$cvWidget) {
                var index = model.$cvWidget.modelItems.indexOf(ctrlWidget.$cvWidget);
                if (index !== -1) {
                  model.$cvWidget.modelItems.splice(index, 1);
                  if (model.designPropertyValues().showSequenceInCanvas) {
                    let props = { 'showSequenceInCanvas': true };
                    ctrl.updateObject(model, model.designPropertyValues(), props);
                  }
                }
              }
            }
            else if (tagName === 'twx-dt-image' || tagName === 'twx-dt-label' || tagName === 'twx-dt-sensor' ||
                tagName === 'twx-dt-target' || tagName === 'twx-dt-image' || tagName === 'twx-dt-target-spatial' || tagName === 'twx-dt-target-model') {
              if (ctrl.mySession && ctrlWidget.$cvWidget) {
                ctrl.mySession.DeleteImageMarker(ctrlWidget.$cvWidget);
              }

              // I need to remove the pointer to the model target from a corresponding model. But there can be only one model target on the scene. So I can remove "all of them" and it'll be OK.
              if (tagName === 'twx-dt-target-model') {
                for (var wdgt in ctrl.myWidgets) {
                  if (ctrl.myWidgets[wdgt].getWidgetTagName() === 'twx-dt-model') {
                    ctrl.myWidgets[wdgt].modelTarget = undefined;
                  }
                }
              }
            }

            delete ctrl.myWidgets[ctrlWidget.widgetId];
            if (ctrlWidget.$cvWidget) {
              ctrlWidget.$cvWidget.delete();
            }
            ctrlWidget.$cvWidget = null;
            resizeFloorDebounce();
          }
        };

        var resizeFloorDebounce = _.debounce(function() {
          if (ctrl.mySession) {
            resizeFloor(ctrl.mySession, ctrl.floorsize, getFeatureToggle($rootScope, 'adaptiveFloorHeight'));
          }
        }, 100);

        ctrl.detachChildModelItems = function (ctrlWidget) {
          ctrlWidget.$cvWidget.modelItems.forEach(function(modelItem) {
            ctrl.detachedModelItems.push(modelItem.ctrlWidget);
            var hiddenItem = ctrl.hiddenComponents.find(function(item) {
              return modelItem.ctrlWidget.widgetId === item.ctrlWidget.widgetId;
            });
            if (hiddenItem) {
              ctrl.detachedHiddenItems.push(hiddenItem);
            }
            ctrl.removeObject(modelItem.ctrlWidget);
          });
        };

        ctrl.attachModelItems = function (ctrlWidget) {
          ctrl.detachedModelItems.forEach(function(item) {
            ctrl.createObject(item, false);
          });
          ctrl.detachedModelItems = [];
        };

        ctrl.removeHiddenParts = function (ctrlWidget) {
          ctrl.hiddenComponents = ctrl.hiddenComponents.filter(function(item) {
            return ctrlWidget.widgetId !== item.ctrlWidget.widgetId;
          });
        };

        ctrl.selectObject = function (ctrlWidget) {
          if (ctrlWidget) {
            if (ctrlWidget !== selectedWidget) {
              selectedWidget = ctrlWidget;
              if (ctrl.mySession) {
                ctrl.mySession.DeselectAll();
              }
              if (ctrlWidget.$cvWidget) {
                if (ctrl.mySession) {
                  ctrl.mySession.DeselectAll();
                }
                ctrlWidget.$cvWidget.Select(true);
              }
            }
          } else {
            if (ctrl.mySession) {
              ctrl.mySession.DeselectAll();
            }
            selectedWidget = null;
          }
        };

        ctrl.deselectObject = function (ctrlWidget) {
          if (ctrlWidget === selectedWidget) {
            selectedWidget = null;
            if (ctrl.mySession) {
              ctrl.mySession.DeselectAll();
            }
          }
        };


        //***************************************************************
        // Widget Selection Event Handler
        //
        if (unRegSelect) {
          unRegSelect();
        }
        unRegSelect = $scope.$on('select3DObj', function (event, args) {
          var ctrlWidget = args.ctrlWidget;
          if (ctrlWidget.parent) {
            if (selectedWidget === ctrlWidget.parent) {
              return;
            }
            else {
              ctrlWidget = ctrlWidget.parent;
            }
          }
          var tagName = ctrlWidget.getWidgetTagName();
          if (ctrl.getCompHideMode() && (tagName === 'twx-dt-model' || tagName === 'twx-dt-modelitem') ) {
            if (tagName === 'twx-dt-model') {
              if (args.partId === "") {
                ctrlWidget.$cvWidget.SetVisibility(false);
              }
              else {
                ctrlWidget.$cvWidget.SetPartVisibility(args.partId, false, Module.ChildBehaviour.IGNORED, Module.InheritBehaviour.OVERRIDE);
              }
            }
            else if (tagName === 'twx-dt-modelitem') {
              ctrlWidget.$cvWidget.SetVisibility(false);
            }
            if (ctrl.mySession) {
              ctrl.mySession.DeselectAll();
            }
            $scope.$applyAsync(
              ctrl.hiddenComponents.push({ ctrlWidget: ctrlWidget, partId: args.partId })
            );
          }

          if (selectedWidget !== ctrlWidget) {
            selectedWidget = ctrlWidget;

            ctrlWidget.select();
          }
          ctrl.setReposMode(ctrl.reposMode, false);
          $scope.$applyAsync();
        });

        //***************************************************************
        // Widget Deselection Event Handler
        //
        if (unRegDeselect) {
          unRegDeselect();
        }
        unRegDeselect = $scope.$on('deselect3DObj', function (event, args) {
          var ctrlWidget = args.ctrlWidget;
          if (!ctrl.getCompHideMode()) {
            if (selectedWidget === ctrlWidget) {
              selectedWidget = null;
            }
          }
          $scope.$applyAsync();
        });

        //***************************************************************
        // Widget Move Event Handler
        //
        if (unRegMove) {
          unRegMove();
        }
        unRegMove = $scope.$on('move3DObj', _.debounce(function (event, args) {
          var ctrlWidget = args.ctrlWidget;
          if (ctrlWidget.parent) {
            ctrlWidget = ctrlWidget.parent;
          }
          if (selectedWidget === ctrlWidget && parent.document.activeElement.tagName === 'IFRAME') {
            var props = {
              x: args.location.position.x.toFixed(4),
              y: args.location.position.y.toFixed(4),
              z: args.location.position.z.toFixed(4),
              rx: args.location.orientation.x.toFixed(2),
              ry: args.location.orientation.y.toFixed(2),
              rz: args.location.orientation.z.toFixed(2),
              scale: args.location.scale.x.toFixed(4),
            };
            selectedWidget.setProps(props);
          }

          resizeFloor(ctrl.mySession, ctrl.floorsize, getFeatureToggle($rootScope, 'adaptiveFloorHeight'));
        }, 150));

        //***************************************************************
        // Widget Loaded Event Handler
        //
        if (unRegLoaded) {
          unRegLoaded();
        }
        unRegLoaded = $scope.$on('loaded3DObj', function (event, args) {
          var ctrlWidget = args.ctrlWidget;
          if (ctrlWidget.$cvWidget) {

            // strip any properties that might cause a re-load
            var stripped_props = _.omit(ctrlWidget.designPropertyValues(), ['src', 'url', 'text', 'textprops', 'textattrs', 'font',
              'fontsize', 'textx', 'texty', 'imagex', 'imagey', 'canvasheight', 'canvaswidth','canvasgrowthoverride', 'fontColor',
              'fontOutlineColor', 'fontFamily']);
            ctrl.updateObject(ctrlWidget, ctrlWidget.designPropertyValues(), stripped_props);
            var tagName = ctrlWidget.getWidgetTagName();
            if (selectedWidget === ctrlWidget && ctrl.mySession) {
              ctrl.mySession.DeselectAll();
              ctrlWidget.$cvWidget.Select(true);
            }

            if (tagName === 'twx-dt-model') {
              ctrl.attachModelItems(ctrlWidget);
              if (ctrlWidget.modelTarget) {
                UpdateModelTargetLocation(ctrlWidget.modelTarget, true);
              }
            }
            else if (tagName === 'twx-dt-modelitem')
            {
              var hiddenItem = ctrl.detachedHiddenItems.find(function(item) {
                return ctrlWidget.widgetId === item.ctrlWidget.widgetId;
              });

              if (hiddenItem)
              {
                hiddenItem.ctrlWidget.$cvWidget.SetVisibility(false);
                ctrl.hiddenComponents.push(hiddenItem);
                ctrl.detachedHiddenItems = ctrl.detachedHiddenItems.filter(function(item) {
                  return hiddenItem.ctrlWidget.widgetId !== item.ctrlWidget.widgetId;
                });
              }
            }
            else if (tagName === 'twx-dt-image' || tagName ==='twx-dt-label' || tagName ==='twx-dt-sensor') {
              ctrlWidget.$cvWidget.ApplySize();
            }
            else if (tagName === 'twx-dt-target-model') {
              var props = ctrlWidget.designPropertyValues();
              if (props.model) {
                if (ctrl.myWidgets[props.model]) {
                  ctrlWidget.model = ctrl.myWidgets[props.model].$cvWidget;
                  UpdateModelTargetLocation(ctrlWidget.$cvWidget, true);
                }
              }
            }

            if (ctrlWidget.$cvWidget.dropCoords) {
              ctrl.doZoomSelectedIfNotInView();
            } else {
              ctrl.doZoomAll();
            }

            if (tagName === 'twx-dt-target' || tagName === 'twx-dt-target-image')
            {
              if (ctrl.reposMode !== 'mate') {
                ctrl.setReposMode('mate');
              }
            }
            else if(tagName === 'twx-dt-target-spatial' || tagName === 'twx-dt-target-model') {
              ctrl.setReposMode('none');
            }
            else
            {
              if (ctrl.reposMode !== 'translate') {
                ctrl.setReposMode('translate');
              }
            }

            resizeFloor(ctrl.mySession, ctrl.floorsize, getFeatureToggle($rootScope, 'adaptiveFloorHeight'));
            ctrl.setReposMode(ctrl.reposMode, false);
          }
        });

        //***************************************************************
        // Widget Load Error Event Handler
        //
        if (unRegLoadErr) {
          unRegLoadErr();
        }
        unRegLoadErr = $scope.$on('loadError3DObj', function (event, args) {
          var ctrlWidget = args.ctrlWidget;
          ctrl.removeObject(ctrlWidget);
        });

        //***************************************************************
        // Widget Ready-for-zoom Event Handler
        //
        if (unRegReady) {
          unRegReady();
        }
        unRegReady = $scope.$on('readyForZoom3DObj', function (event, args) {
          var ctrlWidget = args.ctrlWidget;
          if (ctrlWidget.$cvWidget) {
            if (ctrlWidget.$cvWidget.dropCoords) {
              ctrl.doZoomSelectedIfNotInView();
            } else {
              ctrl.doZoomAll();
            }
          }
        });


        //***************************************************************
        // Widget Property Updates
        //
        ctrl.updateObject = function (ctrlWidget, props, changedProps) {
          var tagName = ctrlWidget.getWidgetTagName();
          var cvWidget = ctrlWidget.$cvWidget;
          if (ctrlWidget && cvWidget && parent.document.activeElement.tagName !== 'IFRAME') {

            // Don't try and update Custom Widgets - they are just a container for other primitives.
            if (cvWidget.isCustomWidget) {
              return;
            }

            if ("idpath" in changedProps) {
              if (cvWidget.GetIdPath() !== props.idpath && cvWidget.GetIdPath()) { //Empty idpath for models not yet loaded
                var model = ctrl.myWidgets[props.model].$cvWidget;
                cvWidget.SetModelAndIdPath(model, props.idpath);
                var location = cvWidget.GetLocation();
                var new_pos_props = {
                  x: location.position.x.toFixed(4),
                  y: location.position.y.toFixed(4),
                  z: location.position.z.toFixed(4),
                  rx: location.orientation.x.toFixed(2),
                  ry: location.orientation.y.toFixed(2),
                  rz: location.orientation.z.toFixed(2),
                  scale: location.scale.x.toFixed(4)
                };
                var newProps = _.omit(props, ['idpath', 'x', 'y', 'z', 'rx', 'ry', 'rz', 'scale']);
                ctrlWidget.setProps(new_pos_props);
                ctrl.updateObject(ctrlWidget, props, newProps);
                ctrl.mySession.SelectModelItem(cvWidget, true);
                return;
              }
            }
            if ('widgetId' in changedProps) {
              //reassign cached ctrl value
              ctrl.myWidgets[ctrlWidget.widgetId] = ctrlWidget;
            }
            if ("url" in changedProps) {
              if (cvWidget.GetSourceURL() !== props.url) {
                handleDefaultImage(props, tagName);
                cvWidget.LoadFromURL(props.url);
              }
            }

            //ACC HACKING: if anchorsrc is changed, derive src and put it in changedPros so
            //  that the next conditional is met. The same goes for positional stuff
            if ("anchorsrc" in changedProps) {
              // - by default src = resource/Tester/src/phone/resources/
              // - generated pvz put in the following by server code:
              //    \Users\achopra\Documents\ThingWorxStudio\Projects\Tester\src\spatial_map_geom
              //    "resource/Tester/src/phone/resources/Uploaded/mesh_30-Jun-2017-01593129.bin"
              const anchorSrcObj = parseResourceStringForSmap(changedProps['anchorsrc']);
              if (anchorSrcObj.dir) {
                const src = 'resource/' + anchorSrcObj.project + '/src/spatial_map_geom/' + anchorSrcObj.dir + '/' + anchorSrcObj.dir+ '.pvz';
                changedProps['src'] = src;
                props['src'] = src;
                // Read the json file for the anchor to set its position based on the transformation in it
                const anchorJsonUrl = src.substr(0, src.length - 4) + '.json';
                $http.get(anchorJsonUrl, {cache: true}).then(function (response) {
                  const anchor = response.data;
                  // transformToWorld property has each element of its 4X4 matrix as a separate property.
                  // Only translation (x, y, z) is needed.
                  ctrlWidget.setProps({
                    x: anchor.transformToWorld.m41,
                    y: anchor.transformToWorld.m42,
                    z: anchor.transformToWorld.m43,
                    anchorguid: anchor.spatialAnchorGuid
                  });
                });
              } else {
                changedProps['src'] = changedProps['anchorsrc'];
                props['src'] = changedProps['anchorsrc'];
              }
            }
            if ("src" in changedProps) {
              if (tagName === 'twx-dt-model' || tagName === 'twx-dt-spatial-map') {
                if (cvWidget.GetSourceURL() !== props.src) {
                  $timeout(function() {
                    ctrl.detachChildModelItems(ctrlWidget);
                  });
                  ctrl.removeHiddenParts(ctrlWidget); $scope.$applyAsync();
                  cvWidget.LoadModel(props.src);
                  if (tagName === 'twx-dt-model' && ctrlWidget.modelTarget) {
                    ctrlWidget.modelTarget.srcChanged = true;
                  }
                }
              }
              else if (tagName === 'twx-dt-sensor') {
                GenerateMarkupImage(cvWidget, props);
              }
              else {
                if (cvWidget.GetSourceURL() !== props.src) {
                  handleDefaultImage(props, tagName);
                  cvWidget.LoadFromURL(props.src);
                }
              }
            }
            if ("model" in changedProps) {
              if (tagName === 'twx-dt-target-model') {
                var modelWidget = ctrl.myWidgets[props.model];
                if (ctrlWidget.model) {
                  ctrlWidget.model.ctrlWidget.modelTarget = undefined;
                }
                ctrlWidget.model = modelWidget.$cvWidget;
                modelWidget.modelTarget = cvWidget;
                UpdateModelTargetLocation(cvWidget, true);
              }
            }
            if ("x" in changedProps || "y" in changedProps || "z" in changedProps) {
              if (tagName !== "twx-dt-target-model") {
                if ("anchorsrc" in changedProps) {
                  // Make sure surrounding meshes of spatial anchors are rendered at origin
                  cvWidget.SetPosition(0, 0, 0);
                } else if (!isNaN(Number(props.x)) && !isNaN(Number(props.y)) && !isNaN(Number(props.z))) {
                  cvWidget.SetPosition(Number(props.x), Number(props.y), Number(props.z));
                }
              }
            }
            if ("rx" in changedProps || "ry" in changedProps || "rz" in changedProps) {
              if (tagName !== "twx-dt-target-model") {
                let orientation = cvWidget.GetLocation().orientation;
                let rx = isNaN(Number(props.rx)) ? orientation.x : Number(props.rx);
                let ry = isNaN(Number(props.ry)) ? orientation.y : Number(props.ry);
                let rz = isNaN(Number(props.rz)) ? orientation.z : Number(props.rz);
                cvWidget.SetOrientation(rx, ry, rz);
              }
            }
            if ("scale" in changedProps || "width" in changedProps || "height" in changedProps) {
              if (tagName === 'twx-dt-model' || tagName === 'twx-dt-modelitem') {
                cvWidget.SetScale(Number(props.scale));
              }
              else {
                if ("height" in changedProps) {
                  ctrlWidget.totalHeight = undefined;
                }
                if ("width" in changedProps) {
                  ctrlWidget.totalWidth = undefined;
                }
                SetHeightWidth(cvWidget, props);
              }
            }
            else if ("sx" in changedProps || "sy" in changedProps || "sz" in changedProps) {
              if (tagName === "twx-dt-model" || tagName === 'twx-dt-modelitem') {
                cvWidget.SetScale(Number(props.sx));
              }
              else {
                cvWidget.SetScaleWidth(Number(props.sx));
                cvWidget.SetScaleHeight(Number(props.sy));
              }
            }
            if ("visible" in changedProps) {
              // Do not reflect visibility in the Edit Canvas
              // cvWidget.SetVisibility(Number(props.visible), false);
            }
            if ("color" in changedProps) {
              var color = changedProps.color;
              if (color) {
                var rgb = color.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
                if (rgb) {
                  cvWidget.SetColor(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, 1.0);
                }
              }
              else {
                  cvWidget.UnsetColor();
              }
            }
            if ("decal" in changedProps) {
              cvWidget.SetDecal(parseBool(props.decal));
            }
            if ("opacity" in changedProps || "occlude" in changedProps) {
              if (tagName === 'twx-dt-model' || tagName === 'twx-dt-modelitem') {
                if (parseBool(props.occlude)) {
                  cvWidget.SetRenderMode(Module.RenderMode.OCCLUDING, 0);
                } else if (cvWidget.isPlaceHolder) {
                  cvWidget.SetRenderMode(Module.RenderMode.PHANTOM, 0.2);
                }
                else {
                  var opacity = Number(props.opacity);
                  if (opacity < 1.0) {
                    if (opacity < 0.01) {
                       opacity =  0.01;
                    }
                    cvWidget.SetRenderMode(Module.RenderMode.PHANTOM, opacity);
                  }
                  else {
                    cvWidget.SetRenderMode(Module.RenderMode.SHADED, 0);
                  }
                }
              }
              else {
                if ("opacity" in changedProps) {
                  cvWidget.SetOpacity(Number(props.opacity));
                }
                if ("occlude" in changedProps) {
                  cvWidget.SetOccluding(parseBool(props.occlude));
                }
              }
            }
            if ("billboard" in changedProps) {
              cvWidget.SetBillboard(parseBool(props.billboard));
            }
            if ("text" in changedProps || "textprops" in changedProps || "textattrs" in changedProps || "font" in changedProps ||
              "fontsize" in changedProps || "textx" in changedProps || "texty" in changedProps || "imagex" in changedProps ||
              "imagey" in changedProps || "canvasheight" in changedProps || "canvaswidth" in changedProps ||
              "canvasgrowthoverride" in changedProps || 'fontColor' in changedProps || 'fontOutlineColor' in changedProps || 'fontFamily' in changedProps ||
              'class' in changedProps) {
                 GenerateMarkupImage(cvWidget, props);
            }
            if ("pivot" in changedProps) {
              var anchor = Module.AnchorType.MIDDLE_CENTER;
              switch (Number(props.pivot)) {
                case 1:
                  anchor = Module.AnchorType.TOP_LEFT;
                  break;
                case 2:
                  anchor = Module.AnchorType.TOP_CENTER;
                  break;
                case 3:
                  anchor = Module.AnchorType.TOP_RIGHT;
                  break;
                case 4:
                  anchor = Module.AnchorType.MIDDLE_LEFT;
                  break;
                case 5:
                  anchor = Module.AnchorType.MIDDLE_CENTER;
                  break;
                case 6:
                  anchor = Module.AnchorType.MIDDLE_RIGHT;
                  break;
                case 7:
                  anchor = Module.AnchorType.BOTTOM_LEFT;
                  break;
                case 8:
                  anchor = Module.AnchorType.BOTTOM_CENTER;
                  break;
                case 9:
                  anchor = Module.AnchorType.BOTTOM_RIGHT;
                  break;
              }
              cvWidget.SetAnchor(anchor);
            }
            if('showSequenceInCanvas' in changedProps || 'sequence' in changedProps) {
              let seqLoaded = false;
              if (props.showSequenceInCanvas && props.sequence) {
                let sequenceName = GetSequenceNamefromUrl(props.sequence, cvWidget);
                if (sequenceName) {
                  seqLoaded = true;
                  cvWidget.LoadIllustrationWithCallback(sequenceName, cvWidget.IllustrationLoadedHandler);
                }
              }
              if (!seqLoaded) {
                cvWidget.LoadIllustrationWithCallback("", cvWidget.IllustrationLoadedHandler);
              }
            }

            resizeFloor(ctrl.mySession, ctrl.floorsize, getFeatureToggle($rootScope, 'adaptiveFloorHeight'));
          }
        };

        ctrl.beforeDestroy = function () {
          if (ctrl.mySession) {
            cvApi.DeleteSession(ctrl.mySession);
            delete ctrl.mySession;
          }
        };

        ctrl.cvApiReady = function () {
          $rootScope.thingViewReady = true;
          $rootScope.$broadcast('stop-load-spinner');
          cvApi.SetInitFlags(
            Module.ThingViewInitFlags.CLEAR_UNUSED_SHAPES_ON_DESTRUCTION.value | // jshint bitwise:false
            Module.ThingViewInitFlags.ENABLE_HIDDEN_RC_SHAPE_INSTANCE.value |
            Module.ThingViewInitFlags.USE_ADVANCED_SELECTION_MANAGER.value |
            Module.ThingViewInitFlags.USE_OVERRIDE_INHERIT_BEHAVIOUR.value);
          ctrl.mySession = cvApi.CreateSession(ctrl.element.id);
          ctrl.mySession.AllowPartSelection(false);
          ctrl.mySession.SetDragMode(Module.DragMode.NONE);
          ctrl.mySession.SetDragSnap(false);
          ctrl.mySession.EnableDraggerHotkeys(false);
          ctrl.mySession.SetBackgroundColor(0xEEEEEEFF);
          ctrl.mySession.ShowGnomon(true);
          ctrl.mySession.SetNavigationMode(Module.NavMode.VUFORIA);
          ctrl.mySession.AllowCameraApplications(false);
          ctrl.mySession.SetZoomOnLoad(false);

          resizeFloor(ctrl.mySession, ctrl.floorsize, getFeatureToggle($rootScope, 'adaptiveFloorHeight'));

          if ($rootScope.builderSettings.antiAliasingEnabled === false) {
            ctrl.mySession.SetAntialiasingMode(Module.AntialiasingMode.NONE);
          } else {
            ctrl.mySession.SetAntialiasingMode(Module.AntialiasingMode.SS4X);
          }

          if ($rootScope.builderSettings.viewMode === "orthographic") {
            ctrl.mySession.SetOrthographicProjection(1.0);
          } else {
            ctrl.mySession.SetPerspectiveProjection(45);
          }

          if ($rootScope.builderSettings.enable3dSelectionColorSettings) {
            let hoverBorderColor3d = rgbaToInteger($rootScope.builderSettings.HoverBorderColor3d);
            let hoverFillColor3d = rgbaToInteger($rootScope.builderSettings.HoverFillColor3d);
            if (hoverBorderColor3d !== -1 && hoverFillColor3d !== -1) {
              ctrl.mySession.SetSelectionColor(Module.SelectionList.PRESELECTION, hoverFillColor3d, hoverBorderColor3d);
            }
            let selectionBorderColor3d = rgbaToInteger($rootScope.builderSettings.SelectionBorderColor3d);
            let selectionFillColor3d = rgbaToInteger($rootScope.builderSettings.SelectionFillColor3d);
            if (selectionBorderColor3d !== -1 && selectionFillColor3d !== -1) {
              ctrl.mySession.SetSelectionColor(Module.SelectionList.PRIMARYSELECTION, selectionFillColor3d, selectionBorderColor3d);
            }
          }

          let shadows = Module.ShadowMode.SOFT_DROP_SHADOW; // default
          if ($rootScope.builderSettings.designTimeDropShadows === "OFF") {
            shadows = Module.ShadowMode.OFF;
          } else if ($rootScope.builderSettings.designTimeDropShadows === "HARD") {
            shadows = Module.ShadowMode.SHARP_DROP_SHADOW;
          }
          ctrl.mySession.SetShadowMode(shadows);

          ctrl.updateWidgetsOnStart();
        };

        /**
         * Reusable sort function for the widget collection, for _.sortBy
         * @param {*} widget
         */
        function widgetTypeModelFirstSorter(widget) {
          if (widget.getWidgetTagName() === 'twx-dt-model') {
            return 0;
          }
          return 1;
        }

        /**
         * Will update properties for all widgets found, but will gaurantee models are process first.
         */
        ctrl.updateWidgetsOnStart = function updateWidgetsOnStart() {
          //Sort by models to make sure model-items are processed after the models
          angular.forEach(_.sortBy(ctrl.myWidgets, widgetTypeModelFirstSorter), function (ctrlWidget, widgetId) {
            ctrlWidget.$cvWidget = ctrl.getWidgetFactory(ctrlWidget.getWidgetTagName())(ctrlWidget);
            ctrlWidget.$cvWidget.ctrlWidget = ctrlWidget;
            ctrl.updateObject(ctrlWidget, ctrlWidget.designPropertyValues(), ctrlWidget.designPropertyValues());
          });
        };

        ctrl.hasSelectedObject = function () {
          if (!ctrl.mySession) {
            return false;
          }
          if (ctrl.mySession.GetSelectionCount() > 0) {
            return true;
          } else {
            return false;
          }
        };

        ctrl.canMate = function () {
          // Widgets specified in this "if condition" cannot be mated
          if (selectedWidget) {
            if (selectedWidget.getWidgetTagName() === 'twx-dt-target-spatial' || selectedWidget.getWidgetTagName() === 'twx-dt-target-model') {
              return false;
            } else {
              return true;
            }
          }

          return false;
        };

        ctrl.canTranslate = function () {
          // Widgets specified in this "if condition" cannot be translated
          if (selectedWidget) {
            if (selectedWidget.getWidgetTagName() === 'twx-dt-target-model') {
              return false;
            } else {
              return true;
            }
          }

          return false;
        };

        // Various functions to handle the Component Hide mode
        ctrl.hasHiddenComponents = function () {
          return ctrl.hiddenComponents.length > 0;
        };
        ctrl.getCompHideMode = function () {
          return (ctrl.currentMode === 'compHide');
        };
        ctrl.toggleCompHideMode = function () {
          if (ctrl.getCompHideMode()) {
            ctrl.setAuthoringMode();
          } else {
            ctrl.setCompHideMode();
          }
        };
        ctrl.unhideAll = function () {
          ctrl.hiddenComponents.forEach(function (item) {
            if (item.partId === "") {
              item.ctrlWidget.$cvWidget.SetVisibility(true);
            }
            else {
              item.ctrlWidget.$cvWidget.SetPartVisibility(item.partId, true, Module.ChildBehaviour.IGNORED, Module.InheritBehaviour.OVERRIDE);
            }
          });
          ctrl.hiddenComponents = [];
        };
        ctrl.setAuthoringMode = function () {
          if (ctrl.mySession) {
            ctrl.mySession.DeselectAll();
            ctrl.mySession.AllowPartSelection(false);
          }
          ctrl.currentMode = 'authoring';
        };
        ctrl.setCompHideMode = function () {
          if (ctrl.mySession) {
            ctrl.mySession.DeselectAll();
            selectedWidget = null;
            ctrl.mySession.AllowPartSelection(true);
          }
          ctrl.currentMode = 'compHide';
        };

        // Get the Dragger Mode
        ctrl.getDraggerMode = function () {
          return ctrl.reposMode;
        };

        // Set the Dragger Mode
        ctrl.setReposMode = function (mode, toggle = true) {
          if (toggle && ctrl.reposMode === mode) {
            mode = 'none';
          }
          if (selectedWidget && selectedWidget.$cvWidget && selectedWidget.$cvWidget.isCustomWidget) {
            if (mode === 'translate' || mode === 'rotate') {
              let props = selectedWidget.designPropertyValues();
              let directions = 0;
              if ('x' in props) { // jshint bitwise:false
                directions = directions | Number(Module.DragDirection.LINEAR_X.value);
              }
              if ('y' in props) {
                directions = directions | Number(Module.DragDirection.LINEAR_Y.value);
              }
              if ('z' in props) {
                directions = directions | Number(Module.DragDirection.LINEAR_Z.value);
              }
              if ('x' in props && 'y' in props) {
                directions = directions | Number(Module.DragDirection.PLANAR_XY.value);
              }
              if ('y' in props && 'z' in props) {
                directions = directions | Number(Module.DragDirection.PLANAR_YZ.value);
              }
              if ('z' in props && 'x' in props) {
                directions = directions | Number(Module.DragDirection.PLANAR_ZX.value);
              }
              if ('rx' in props) {
                directions = directions | Number(Module.DragDirection.ROTATE_X.value);
              }
              if ('ry' in props) {
                directions = directions | Number(Module.DragDirection.ROTATE_Y.value);
              }
              if ('rz' in props) {
                directions = directions | Number(Module.DragDirection.ROTATE_Z.value);
              }
              ctrl.mySession.SetDragDirections(directions);
              ctrl.mySession.SetDragCSYS(Module.DragCSYS.SELECTION);
              ctrl.mySession.SetDragMode(Module.DragMode.DRAG);
            }
            return;
          }

          let tagName = "";
          if (selectedWidget) {
            tagName = selectedWidget.getWidgetTagName();
          }

          if (mode === 'translate' || mode === 'rotate') {
            if (selectedWidget && tagName === 'twx-dt-target-spatial') {
              ctrl.mySession.SetDragCSYS(Module.DragCSYS.WORLD);
              ctrl.mySession.SetDragDirections(Number(Module.DragDirection.LINEAR_Z.value) // jshint bitwise:false
                                             | Number(Module.DragDirection.LINEAR_X.value)
                                             | Number(Module.DragDirection.PLANAR_ZX.value));
            }
            else if (selectedWidget && tagName === 'twx-dt-target-model') {
              ctrl.mySession.SetDragDirections(0);
              ctrl.mySession.SetDragMode(Module.DragMode.NONE);
            }
            else {
              ctrl.mySession.SetDragDirections(Number(Module.DragDirection.ALL.value));
              ctrl.mySession.SetDragCSYS(Module.DragCSYS.SELECTION);
            }
            ctrl.mySession.SetDragMode(Module.DragMode.DRAG);
          }
          else if (mode === 'mate') {
            if (selectedWidget && (tagName === 'twx-dt-target-spatial' || tagName === 'twx-dt-target-model')) {
              ctrl.mySession.SetDragMode(Module.DragMode.NONE);
            } else {
              ctrl.mySession.SetDragMode(Module.DragMode.MATE);
            }
          }
          else {
            ctrl.mySession.SetDragMode(Module.DragMode.NONE);
          }
          ctrl.reposMode = mode;
        };

        // Zoom All
        ctrl.doZoomAll = function() {
          if (ctrl.mySession) {
            ctrl.mySession.ZoomView(Module.ZoomMode.ZOOM_ALL, 0);
          }
        };

        // Zoom Selected
        ctrl.doZoomSelected = function () {
          ctrl.mySession.ZoomView(Module.ZoomMode.ZOOM_SELECTED, 0);
        };

        // Zoom Selected if not already in the camera's view
        ctrl.doZoomSelectedIfNotInView = function () {
          ctrl.mySession.ZoomView(Module.ZoomMode.ZOOM_INCLUDE_SELECTED, 0);
        };

        // Add a spatial map to the canvas *with a spatial anchor*
        ctrl.addSpatialMap = function(ctrlWidget, dropCoords) {
          let widget = addModelFn(ctrlWidget, false);
          widget.props = ctrlWidget.designPropertyValues();
          return widget;
        };

        // Add a Model to the Canvas
        ctrl.addModel = addModelFn;

        function addModelFn(ctrlWidget, dropCoords) {
          let widget = ctrl.mySession.MakeModel();
          widget.SetUserId(ctrlWidget.widgetId);
          widget.ctrlWidget = ctrlWidget;
          widget.dropCoords = Boolean(dropCoords);
          widget.applyOffset = Boolean(dropCoords);
          widget.originOffset = undefined;
          ctrlWidget.$cvWidget = widget;
          widget.modelItems = [];

          // Location Callback
          widget.SetLocationChangeCallback(function() {
            if (widget.ctrlWidget.modelTarget) {
              UpdateModelTargetLocation(widget.ctrlWidget.modelTarget, false);
              widget.ctrlWidget.modelTarget.srcChanged = false;
            }
            $rootScope.$broadcast('move3DObj', { ctrlWidget: widget.ctrlWidget, location: widget.GetLocation() });
          });

          // Pick Callback
          widget.SetPickCallback(function(success, position) {
            widget.session.SetFloorPickable(false);
            var pos = { x: 0, y:0, z:0 };
            if (success) {
              pos = position;
              if (pos.y < 0.002 && pos.y > -0.002) {
                pos.y = 0;
              }
            }
            else {
              var location = widget.session.DoPickAxisPlanes(widget.dropCoords.x, widget.dropCoords.y, true);
              if (location.valid) {
                pos = location.position;
              }
            }
            var props = { x: pos.x.toFixed(4), y: pos.y.toFixed(4), z: pos.z.toFixed(4) };
            widget.ctrlWidget.setProps(props);
            widget.LoadModel(widget.ctrlWidget.designPropertyValues().src);
          });

          // UserPick Callback
          widget.SetUserPickCallback(function(userData) {
            if (userData.type === "data-bind-hover") {
              widget.session.DePreselectAll();
              widget.session.PreSelectModel(widget, true);
            }
            else if (userData.type === "data-bind-drop") {
              let widgetId = widget.ctrlWidget.widgetId;
              if (widget.ctrlWidget.parent) {
                widgetId = widget.ctrlWidget.parent.widgetId;
              }
              window.twx.widgetSelectCallback(widgetId, userData.resolveFn, userData.rejectFn);
            }
          });

          // Selection Callback
          widget.SetSelectionCallback(function (type, instance, idPath, selected, selectType) {
            if (selectType === Module.SelectType.SELECT) {
              if (type === Module.SelectionCallbackType.SHAPEINSTANCE && selectedWidget !== widget.ctrlWidget) {
                if (selected) {
                  $rootScope.$broadcast('select3DObj', { ctrlWidget: widget.ctrlWidget, partId: "" });
                }
                else {
                  $rootScope.$broadcast('deselect3DObj', { ctrlWidget: widget.ctrlWidget, partId: "" });
                }
              }
              else if (type === Module.SelectionCallbackType.PART) {
                if (selected) {
                  $rootScope.$broadcast('select3DObj', { ctrlWidget: widget.ctrlWidget, partId: idPath });
                }
                else {
                  $rootScope.$broadcast('deselect3DObj', { ctrlWidget: widget.ctrlWidget, partId: idPath });
                }
              }
            }
          });

          // Load Model function
          widget.LoadModel = function (src) {
            if (widget.originOffset) {
              var location = widget.GetLocation();
              var props = {
                x: location.position.x + widget.originOffset.x,
                y: location.position.y + widget.originOffset.y,
                z: location.position.z + widget.originOffset.z
              };
              widget.AnimateTransitions(false);
              widget.SetPosition(props.x, props.y, props.z);
              widget.ctrlWidget.setProps(props);
            }
            widget.originOffset = undefined;

            if (!src || src === "" || src.slice(-1) === "/") {
              if (!widget.isPlaceHolder) {
                widget.isPlaceHolder = true;
                widget.LoadFromURLWithCallback("extensions/images/vse-3d-model.ol", true, false, false, widget.ModelLoadedHandler);
              }
            }
            else {
              widget.isPlaceHolder = false;
              widget.LoadFromURLWithCallback(src, true, false, false, widget.ModelLoadedHandler);
            }
          };

          // Model Loaded Callback
          widget.ModelLoadedHandler = function(success, isStructure, errors)
          {
            if (success) {
              widget.loaded = true;
              $rootScope.$broadcast('loaded3DObj', { ctrlWidget: widget.ctrlWidget });
              if (!widget.isPlaceHolder) {
                widget.CalculateOffset();
              }
              if (isStructure) {
                var numItems = widget.modelItems.length;
                for (var i = 0; i < numItems; i++) {
                  var modelItemProps = widget.modelItems[i].ctrlWidget.designPropertyValues();
                  widget.modelItems[i].SetModelAndIdPath(widget, modelItemProps.idpath);
                  widget.modelItems[i].ctrlWidget.$cvWidget = widget.modelItems[i];
                  $rootScope.$broadcast('loaded3DObj', { ctrlWidget: widget.modelItems[i].ctrlWidget });
                }
              }
              else {
                $rootScope.$broadcast('readyForZoom3DObj', { ctrlWidget: widget.ctrlWidget });
                if (!widget.isPlaceHolder && getFeatureToggle($rootScope, 'shrinkwrapModels')) {
                  widget.ExtractSequencePartIdsWithCallback('', widget.SequencePartIdsHandler);
                }
              }
            }
          };

          // Sequence Part Ids Callback
          widget.SequencePartIdsHandler = function(success, name, partIds) {
            if (success) {
              var props = {};
              props.sequencePartIds = [];
              for (var i = 0; i < partIds.size() ; i++) {
                  props.sequencePartIds.push(partIds.get(i));
              }
              widget.ctrlWidget.setProps(props);
            }
          };

          // Illustration Loaded Callback
          widget.IllustrationLoadedHandler = function(success, name, TVstepInfoVec) {
            var numItems = widget.modelItems.length;
            for (var i = 0; i < numItems; i++) {
              $rootScope.$broadcast('loaded3DObj', { ctrlWidget: widget.modelItems[i].ctrlWidget });
            }
          };

          // Return a ModelItem given its IdPath (if it exists)
          widget.GetModelItemFromIdPath = function (idPath) {
            var numItems = widget.modelItems.length;
            for (var i = 0; i < numItems; i++) {
              var modelItemProps = widget.modelItems[i].ctrlWidget.designPropertyValues();
              if (modelItemProps.idpath === idPath) {
                return widget.modelItems[i];
              }
            }
            return null;
          };

          // Select this Model
          widget.Select = function (sel) {
            widget.session.SelectModel(widget, true);
          };

          // Reposition the Model so it sits on the floor
          widget.CalculateOffset = function () {
            if (!this.originOffset) {
              var box = widget.CalculateBoundingBox(new Module.VectorString());
              if (box.valid) {
                var location = widget.GetLocation();
                widget.originOffset = {
                  x: ((box.min.x + box.max.x) / 2) - location.position.x,
                  y: box.min.y - location.position.y,
                  z: ((box.min.z + box.max.z) / 2) - location.position.z
                };
                if (widget.applyOffset) {
                  var props = {
                    x: location.position.x - widget.originOffset.x,
                    y: location.position.y - widget.originOffset.y,
                    z: location.position.z - widget.originOffset.z,
                  };
                  widget.AnimateTransitions(false);
                  widget.SetPosition(props.x, props.y, props.z);
                  widget.AnimateTransitions(true);
                  widget.ctrlWidget.setProps(props);
                }
                widget.applyOffset = true;
              }
            }
          };

          widget.session = ctrl.mySession;
          if (dropCoords && Object.keys(ctrl.myWidgets).length > 1) {
              widget.dropCoords = dropCoords;
              ctrl.mySession.SetFloorPickable(true);
              widget.DoPick(dropCoords.x, dropCoords.y, true);
          }
          else {
              widget.LoadModel(ctrlWidget.designPropertyValues().src);
          }
          return widget;
        }

        // Add a Model Item to the Canvas
        ctrl.addModelItem = function (ctrlWidget, dropCoords) {
          let widget = ctrl.mySession.MakeModelItem();
          widget.ctrlWidget = ctrlWidget;
          widget.dropCoords = Boolean(dropCoords);
          ctrlWidget.$cvWidget = widget;
          widget.session = ctrl.mySession;

          // Location Callback
          widget.SetLocationChangeCallback(function() {
            $rootScope.$broadcast('move3DObj', { ctrlWidget: widget.ctrlWidget, location: widget.GetLocation() });
          });

          // Selection Callback
          widget.SetSelectionCallback(function (type, instance, idPath, selected, selectType) {
            if (selectType === Module.SelectType.SELECT &&
                type === Module.SelectionCallbackType.BASE &&
                selectedWidget !== widget.ctrlWidget) {
              if (selected) {
                $rootScope.$broadcast('select3DObj', { ctrlWidget: widget.ctrlWidget, partId: "" });
              }
              else {
                $rootScope.$broadcast('deselect3DObj', { ctrlWidget: widget.ctrlWidget, partId: "" });
              }
            }
          });

          // User Pick Callback
          widget.SetUserPickCallback(function(userData) {
            if (userData.type === "data-bind-hover") {
              widget.session.DePreselectAll();
              widget.session.PreSelectModelItem(widget, true);
            }
            else if (userData.type === "data-bind-drop") {
              let widgetId = widget.ctrlWidget.widgetId;
              if (widget.ctrlWidget.parent) {
                widgetId = widget.ctrlWidget.parent.widgetId;
              }
              window.twx.widgetSelectCallback(widgetId, userData.resolveFn, userData.rejectFn);
            }
          });

          // Pick Callback
          widget.SetPickCallback(function(success, modelPtr, idPath) {
            var done = false;
            if (success && modelPtr) {
              let ctrlWidget = ctrl.myWidgets[modelPtr.GetUserId()];
              if (ctrlWidget && !ctrlWidget.parent) { // Can't create a Model Item from a child of a custom widget
                let model = ctrlWidget.$cvWidget;
                if (model) {
                  done = true;
                  if (!idPath) {
                    idPath = "/";
                  }
                  if (model.isPlaceHolder) { // Can't create a Model Item from a placeholder
                    window.alert(window.i18next.t('ves-ar-extension:Drop On Canvas Failed', {widget: window.i18next.t('ves-ar-extension:Model Item')}));
                    widget.session.RemoveModelItemPtr(widget, false);
                    widget.ctrlWidget.remove();
                    delete widget.ctrlWidget;
                  }
                  else if (model.GetModelItemFromIdPath(idPath)) { // Can't create a Model Item on a pre-exisiting Model Item
                    window.alert('A Model Item for this part already exists.');
                    widget.session.RemoveModelItemPtr(widget, false);
                    widget.ctrlWidget.remove();
                    delete widget.ctrlWidget;
                  }
                  else {
                    model.modelItems.push(widget);
                    let location = widget.GetLocation();
                    let p = location.position;
                    let o = location.orientation;
                    let props = {
                      model: model.ctrlWidget.widgetId,
                      idpath: idPath,
                      x: p.x.toFixed(4), y: p.y.toFixed(4), z: p.z.toFixed(4),
                      rx: o.x.toFixed(2), ry: o.y.toFixed(2), rz: o.z.toFixed(2),
                      scale: location.scale.x.toFixed(4),
                      visible: true,
                      occlude: false,
                      decal: false,
                      opacity: 1
                    };
                    widget.ctrlWidget.setProps(props);
                    $rootScope.$broadcast('loaded3DObj', { ctrlWidget: widget.ctrlWidget });
                  }
                }
              }
            }
            if (!done) {
              window.alert(window.i18next.t('ves-ar-extension:Drop On Canvas Failed', {widget: window.i18next.t('ves-ar-extension:Model Item')}));
              $rootScope.$broadcast('loadError3DObj', { ctrlWidget: widget.ctrlWidget });
              widget.ctrlWidget.remove();
              delete widget.ctrlWidget;
            }
          });

          widget.Select = function (sel) {
            widget.session.SelectModelItem(widget, true);
          };

          if (dropCoords) {
            widget.DoPick(dropCoords.x, dropCoords.y, true);
          }
          else {
            var props = ctrlWidget.designPropertyValues();
            if (props.model) {
              if (ctrl.myWidgets[props.model]) {
                var cvModel = ctrl.myWidgets[props.model].$cvWidget;
                cvModel.modelItems.push(widget);
                if (ctrl.myWidgets[props.model].loaded) {
                  ctrlWidget.$cvWidget.SetModelAndIdPath(cvModel, props.idpath);
                  $rootScope.$broadcast('loaded3DObj', { ctrlWidget: ctrlWidget });
                }
              }
            }
          }
          return widget;
        };

        // Add a Model Target to the Canvas
        ctrl.addModelTarget = function (ctrlWidget, dropCoords) {
          var uuidv4 = function uuidv4 () {
            return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
              (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); // jshint ignore:line
          };
          var widget = CreateImageMarker(ctrlWidget, dropCoords, ctrl.mySession);
          widget.SetLocationChangeCallback(null);
          widget.SetUserPickCallback(null);

          widget.HandlePicks = function(result) {
            let model;
            let modelPtr = result.GetModel();
            if (modelPtr) {
              model = ctrl.myWidgets[modelPtr.GetUserId()].$cvWidget;
            }
            if (model) {
              widget.ctrlWidget.setProps( { 'model': model.ctrlWidget.widgetId });
              model.ctrlWidget.modelTarget = widget;
              var props = widget.ctrlWidget.designPropertyValues();
              handleDefaultImage(props, widget.ctrlWidget.getWidgetTagName());
              widget.LoadFromURL(props.url || props.src);
            }
            else {
              window.alert(window.i18next.t('ves-ar-extension:Drop On Canvas Failed', {widget: window.i18next.t('ves-ar-extension:Model Target')}));
              $rootScope.$broadcast('loadError3DObj', { ctrlWidget: widget.ctrlWidget });
              widget.ctrlWidget.remove();
              delete widget.ctrlWidget;
            }
          };

          if (dropCoords) {
            widget.dropCoords = dropCoords;
            ctrl.mySession.SetFloorPickable(false);
            widget.DoPickWithCallback(dropCoords.x, dropCoords.y, true, widget.HandlePicks);
            ctrlWidget.setProp('targetId', uuidv4());
          }
          else {
            var props = ctrlWidget.designPropertyValues();
            if (props.model) {
              if (ctrl.myWidgets[props.model]) {
                var modelWidget = ctrl.myWidgets[props.model];
                modelWidget.modelTarget = widget;
              }
            }
            handleDefaultImage(props, ctrlWidget.getWidgetTagName());
            widget.LoadFromURL(props.url || props.src);
            widget.size = { height: props.height, width: props.width ,scale:props.scale };
          }
          return widget;
        };

        // Add an Image Marker to the Canvas
        ctrl.addImageMarker = function (ctrlWidget, dropCoords) {
          var widget = CreateImageMarker(ctrlWidget, dropCoords, ctrl.mySession);
          if (dropCoords && Object.keys(ctrl.myWidgets).length > 1) {
            widget.dropCoords = dropCoords;
            ctrl.mySession.SetFloorPickable(true);
            widget.DoPickWithCallback(dropCoords.x, dropCoords.y, true, function(result) {
              ImageMarkerPickHandler(widget, result);
            });
          }
          else {
            var props = ctrlWidget.designPropertyValues();
            handleDefaultImage(props, ctrlWidget.getWidgetTagName());
            widget.LoadFromURL(props.url || props.src);
            widget.size = { height: props.height, width: props.width,scale: props.scale };
          }
          return widget;
        };

        // Add a Text Marker to the Canvas
        ctrl.addTextMarker = function (ctrlWidget, dropCoords) {
          var widget = CreateImageMarker(ctrlWidget, dropCoords, ctrl.mySession);
          if (dropCoords && Object.keys(ctrl.myWidgets).length > 1) {
            widget.dropCoords = dropCoords;
            ctrl.mySession.SetFloorPickable(true);
            widget.DoPickWithCallback(dropCoords.x, dropCoords.y, true, function(result) {
              ImageMarkerPickHandler(widget, result);
            });
          }
          else {
            var props = ctrlWidget.designPropertyValues();
            GenerateMarkupImage(widget, props);
          }
          return widget;
        };

        // Add a Combo Marker to the Canvas
        ctrl.addComboMarker = function (ctrlWidget, dropCoords) {
          var widget = CreateImageMarker(ctrlWidget, dropCoords, ctrl.mySession);
          if (dropCoords && Object.keys(ctrl.myWidgets).length > 1) {
            widget.dropCoords = dropCoords;
            ctrl.mySession.SetFloorPickable(true);
            widget.DoPickWithCallback(dropCoords.x, dropCoords.y, true, function(result) {
              ImageMarkerPickHandler(widget, result);
            });
          }
          else {
            var props = ctrlWidget.designPropertyValues();
            GenerateMarkupImage(widget, props);
          }
          return widget;
        };

        // Add a Custom Widget to the Canvas
        ctrl.addCustomWidget = function (ctrlWidget, dropCoords) {
          var widget = {
            children: [],
            isCustomWidget: true
          };
          let childElements = ctrlWidget.element().find('twx-widget-design-content').children();
          let childCount = childElements.length > 0 ? 1 : 0; // for now, only support one child, due to selection issues

          function AddChild(childElement, id) {
            let childTagName = childElement.tagName.toLowerCase();
            if (childTagName === 'twx-dt-image' || childTagName === 'twx-dt-model') {
              let childCtrlWidget = { me: {} };
              for (let j = 0; j < childElement.attributes.length; j++) {
                let attributeName = childElement.attributes[j].name;
                let attributeValue = childElement.attributes[j].value;
                childCtrlWidget.me[attributeName] = attributeValue;
              }
              childCtrlWidget.widgetId = id;
              childCtrlWidget.parent = ctrlWidget;
              childCtrlWidget.getWidgetTagName = function() {
                return childTagName;
              };
              childCtrlWidget.element = function() {
                return [ childElement ];
              };
              childCtrlWidget.designPropertyValues = function() {
                return childCtrlWidget.me;
              };
              widget.children.push(childCtrlWidget);
              let childWidgetFactory = ctrl.getWidgetFactory(childElement.tagName.toLowerCase());
              childCtrlWidget.$cvWidget = childWidgetFactory(childCtrlWidget, undefined);
              childCtrlWidget.mutationCallback = function(mutationRecords) {
                let changedProps = {};
                mutationRecords.forEach(function (mutation) {
                  let name = mutation.attributeName;
                  let value = mutation.target.getAttribute(name);
                  changedProps[name] = value;
                  childCtrlWidget.me[name] = value;
                });
                ctrl.updateObject(childCtrlWidget, childCtrlWidget.me, changedProps);
              };

              ctrl.myWidgets[childCtrlWidget.widgetId] = childCtrlWidget;

              childCtrlWidget.mutationObserver = new MutationObserver(childCtrlWidget.mutationCallback);
              childCtrlWidget.mutationObserver.observe(childElement, { attributes: true });
            }
          }

          for (let i = 0; i < childCount; i++ ) {
            AddChild(childElements[i], ctrlWidget.widgetId + "-child" + i);
          }

          widget.Select = function(select) { // if parent is selected, select all children
            widget.children.forEach(function(child) {
              let tagName = child.getWidgetTagName();
              if (tagName === 'twx-dt-model') {
                ctrl.mySession.SelectModel(child.$cvWidget, select);
              }
              else if (tagName === 'twx-dt-image') {
                ctrl.mySession.SelectMarker(child.$cvWidget, select);
              }
            });
          };
          return widget;
        };
      }
    };

  /**
   * Creates a ImageMarker widget
   * @param {object} ctrlWidget - the controller for this widget
   * @param {object} dropCoords - the point at which the widget was dropped on the screen (if any)
   * @param {object} session - the session to which the widget should be added
   */
    function CreateImageMarker(ctrlWidget, dropCoords, session) {
      let widget = session.MakeImageMarker();
      ctrlWidget.$cvWidget = widget;
      widget.ctrlWidget = ctrlWidget;
      widget.firstload = true;
      widget.dropCoords = Boolean(dropCoords);
      widget.session = session;

      // Location Callback
      widget.SetLocationChangeCallback(function() {
        $rootScope.$broadcast('move3DObj', { ctrlWidget: widget.ctrlWidget, location: widget.GetLocation() });
      });

      // Selection Callback
      widget.SetSelectionCallback(function(type, selected) {
        if (type === Module.SelectType.SELECT && selected) {
          $rootScope.$broadcast('select3DObj', { ctrlWidget: widget.ctrlWidget });
        }
      });

      // UserPick Callback
      widget.SetUserPickCallback(function(userData) {
        if (userData.type === "data-bind-hover") {
          widget.session.DePreselectAll();
          widget.session.PreSelectMarker(widget, true);
        }
        else if (userData.type === "data-bind-drop") {
          let widgetId = widget.ctrlWidget.widgetId;
          if (widget.ctrlWidget.parent) {
            widgetId = widget.ctrlWidget.parent.widgetId;
          }
          window.twx.widgetSelectCallback(widgetId, userData.resolveFn, userData.rejectFn);
        }
      });

      // Select function
      widget.Select = function (sel) {
        widget.session.SelectMarker(widget, true);
      };

      // ImageMarker Loaded Callback
      widget.ImageMarkerLoaded = function(bool) {
        if (widget.firstload) {
          widget.LockAspectRatio(true);
          widget.firstload = false;
          $rootScope.$broadcast('loaded3DObj', { ctrlWidget: widget.ctrlWidget });
        }
        else {
          SetHeightWidth(widget, widget.ctrlWidget.designPropertyValues());
        }
      };

      // LoadFromURL function
      widget.LoadFromURL = function (url) {
        if (isSVG(url) || widget.ctrlWidget.designPropertyValues().class) {
          GenerateMarkupImage(widget, { src: url });
        }
        else {
          widget.LoadFromURLWithCallback(url, widget.ImageMarkerLoaded);
        }
      };

      // ApplySize function
      widget.ApplySize = function () {
        if (widget.size) {
          SetHeightWidth(widget, widget.size);
        }
      };

      return widget;
    }

  /**
   * Handles the pick result when a Image, Text or Combo Marker has been dropped onto the canvas
   * @param {object} widget - the Image, Text or Combo Marker
   * @param {object} result - the pick result ojbect
   */
    function ImageMarkerPickHandler(widget, result)
    {
      widget.session.SetFloorPickable(false);
      var position  = { x: 0, y: 0, z: 0 };
      var orientation = { x: 0, y: 0, z: 0 };
      var model = result.GetModel();

      if (result.IsValid()) {
        // If the pick hit an object, use it to generate the position & orientation from it.
        let loc = result.GetLocation();
        position = loc.position;
        orientation = widget.GetOrientationFromNormal(loc.orientation);

        if (model) { // hack - push marker forward a fraction to avoid z-fighting
          const offset = 0.0002;
          position.x += loc.orientation.x * offset;
          position.y += loc.orientation.y * offset;
          position.z += loc.orientation.z * offset;
        }

        const floorSnap = 0.002;
        if (position.y < floorSnap && position.y > -floorSnap) {
          position.y = 0;
        }
      }
      else {
        // If to object was hit, try to use the axis planes to generate the position & orientation.
        let loc = widget.session.DoPickAxisPlanes(widget.dropCoords.x, widget.dropCoords.y, true);
        if (loc.valid) {
          position = loc.position;
          orientation = widget.GetOrientationFromNormal(loc.orientation);
        }
      }

      // Set the new positional properties
      var tagName = widget.ctrlWidget.getWidgetTagName();
      var newProps = {
        x: position.x.toFixed(4),
        y: position.y.toFixed(4),
        z: position.z.toFixed(4),
        rx: orientation.x.toFixed(2),
        ry: orientation.y.toFixed(2),
        rz: orientation.z.toFixed(2)
      };
      if (model) {
        newProps.billboard = false;
      }
      if (tagName === 'twx-dt-target-spatial') {
          newProps.y = newProps.ry = newProps.rz = 0;
          newProps.rx = -90;
      }
      widget.ctrlWidget.setProps(newProps);

      // Load the image
      var props = widget.ctrlWidget.designPropertyValues();
      if (tagName === 'twx-dt-image' || tagName === 'twx-dt-target' || tagName === 'twx-dt-target-image' ||
          tagName === 'twx-dt-target-spatial' || tagName === 'twx-dt-target-model') {
        handleDefaultImage(props, tagName);
        widget.LoadFromURL(props.url || props.src);
      }
      else {
        GenerateMarkupImage(widget, props);
      }
    }


   /* Move a ModelTarget to be correctly positioned wrt the Model it is attached to
    * @param {object} widget - the ModelTarget
    * @param {bool} recalculateOffset - Flag to say whether the offset from the model should be recalculated.
    */
    function UpdateModelTargetLocation(widget, recalculateOffset)
    {
      if (widget.ctrlWidget.getWidgetTagName() !== 'twx-dt-target-model') {
        return;
      }

      var model_loc = widget.ctrlWidget.model.GetLocation();

      var recalculate = recalculateOffset || widget.srcChanged || !widget.existing_loc ||
                        !_.isEqual(model_loc.orientation, widget.existing_loc.orientation) ||
                        !_.isEqual(model_loc.scale, widget.existing_loc.scale);

      if (recalculate) {
        var box = widget.ctrlWidget.model.CalculateBoundingBox(new Module.VectorString());
        if (box.valid) {
          widget.existing_loc = {
            orientation: model_loc.orientation,
            scale: model_loc.scale,
            offset: {
              x: ((box.min.x + box.max.x) / 2) - model_loc.position.x,
              y: box.min.y - model_loc.position.y,
              z: ((box.min.z + box.max.z) / 2) - model_loc.position.z
            }
          };
          widget.SetWidth(1.1 * Math.min(box.max.x - box.min.x, box.max.z - box.min.z));
        }
      }

      if (widget.existing_loc) {
        widget.SetPosition(
          model_loc.position.x + widget.existing_loc.offset.x,
          model_loc.position.y + widget.existing_loc.offset.y,
          model_loc.position.z + widget.existing_loc.offset.z
        );
        widget.SetOrientation(-90, 0, 0);
      }

      var locationDebounce = _.debounce(function(location) {
        widget.ctrlWidget.setProps({
           x: location.position.x,     y: location.position.y,     z: location.position.z,
          rx: location.orientation.x, ry: location.orientation.y, rz: location.orientation.z
        });
      }, 150);

      locationDebounce(model_loc);
    }

  }

  /**
   * @param {string} url
   * @returns {boolean} true if given url ends in .svg, false otherwise
   */
  function isSVG(url) {
    return url && url.match(/.*\.svg$/i) ? true : false;
  }

  /**
   * Sets the url property if its not set or ends with /
   * @param props
   * @param widgetTag
     */
  function handleDefaultImage(props, widgetTag) {
    if (props.placeholder_img) {
      // 3D Images will have src property, but ThingMark, Image Target, and Spatial Target have url prop
      var name = widgetTag === 'twx-dt-image' ? 'src' : 'url';
      //Model targets should always use the placeholder in the canvas, the guide-view image may not be appropriate
      if (!props[name] || props[name].slice(-1) === '/' || widgetTag === 'twx-dt-target-model') {
        props[name] = props.placeholder_img;
      }
    }


  }

  function GetTextStyle(textAttrs) {

    var fallbackTextAttrs = {
      "font": "36px Arial",
      "fill": "rgba(120, 255, 200 , 1)",
      "stroke": "rgba(0, 0, 255, 1)"
    };

    var textStyle = {};

    if (textAttrs === undefined) {
      textStyle = fallbackTextAttrs;
    }
    else {
      var tmp = textAttrs.split(";");
      for (var i = 0; i < tmp.length; i++) {
        if (tmp[i]) {
          var inds = tmp[i].split(':');
          textStyle[inds[0].toLowerCase().trim()] = inds[1].trim();
        }
      }
    }

    if (textStyle.linewidth) {
      textStyle.lineWidth = textStyle.linewidth;  //Backwards compatible for mis-spelled property
    }
    if (!textStyle.lineWidth) {
      textStyle.lineWidth = 1;
    }

    return textStyle;
  }

  function SetHeightWidth(widget, props) {
    let tagName = widget.ctrlWidget.getWidgetTagName();
    if (tagName === 'twx-dt-label') {
      if (!props.height && !props.textprops) {
        props.height = 0.05;
      }
    }
    if (tagName === 'twx-dt-label' || tagName === 'twx-dt-image') {
      if (props.height) {
        if (props.height !== widget.ctrlWidget.previousHeight) {
          GenerateMarkupImage(widget, props);
          return;
        }
        else {
          props.height = widget.ctrlWidget.totalHeight;
          if (widget.ctrlWidget.totalWidth) {
            props.width = widget.ctrlWidget.totalWidth;
          }
        }
      }
      else if (props.width) {
        if (props.width !== widget.ctrlWidget.previousWidth) {
          GenerateMarkupImage(widget, props);
          return;
        }
        else {
          props.width = widget.ctrlWidget.totalWidth;
          if (widget.ctrlWidget.totalHeight) {
            props.height = widget.ctrlWidget.totalHeight;
          }
        }
      }
    }
    if (Number(props.width) > 0 && Number(props.height) > 0) {
      widget.LockAspectRatio(false);
      widget.SetWidth(Number(props.width));
      widget.SetHeight(Number(props.height));
    }
    else if (Number(props.width) > 0) {
      widget.LockAspectRatio(true);
      widget.SetWidth(Number(props.width));
    }
    else if (Number(props.height) > 0) {
      widget.LockAspectRatio(true);
      widget.SetHeight(Number(props.height));
    }
    else {
      widget.LockAspectRatio(true);
      widget.SetHeight(Number(widget.GetNativeHeight()));
    }
    if (Number(props.scale) > 0) {
      widget.SetScaleWidth(Number(props.scale));
      widget.SetScaleHeight(Number(props.scale));
    }
    else {
      widget.SetScaleWidth(1.0);
      widget.SetScaleHeight(1.0);
    }
  }

  function GenerateMarkupImage(widget, props) {
    handleDefaultImage(props, widget.ctrlWidget.getWidgetTagName());

    syncClassAttribute(widget.ctrlWidget, props.class);

    if (!props.src || props.src.slice(-1) === '/') { // Label or no image Gauge
      RenderImageAndText(widget, props, null);
    } else {
      var image = new Image();
      image.onerror = function(e) {
        console.error('Could not load image.', e, props.src);
      };
      image.onload = function() {
        RenderImageAndText(widget, props, image);
      };
      if(props.src && props.src.startsWith('http')) {
        image.crossOrigin = "Anonymous";
      }
      image.src = props.src;
    }
  }

  /**
     * Removes non custom classes, jquery drag/drop adds multiple ui- classes
     *
     * Only acts if the class attribute is not undefined as it doesn't exist on the widget
     *  or has never been defined.
     *
     * Adds the new class if its not in classlist
     * @param {Object} ctrlWidget - widget controller
     * @param {String} cls - current class property value
     */
  function syncClassAttribute(ctrlWidget, cls) {
    if (typeof cls !== 'undefined') {
      var element = ctrlWidget.element();
      var cl = element[0].classList;
      cl.forEach(function (nextCls) {
        if (!nextCls.startsWith('ui-') && nextCls !== cls) {
          cl.remove(nextCls);
        }
      });

      if (cls && !cl.contains(cls)) {
        element.addClass(cls); //jqlite handles multiple classes space separated
      }
    }
  }

  function RenderImageAndText(widget, props, image) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    widget.ctrlWidget.previousHeight = props.height;
    widget.ctrlWidget.previousWidth = props.width;
    if (image) {
      constructImageAndTextInfo(props, image, canvas, context, widget.ctrlWidget.element(), widget);
      SetHeightWidth(widget.ctrlWidget.$cvWidget, props);
    }
    else {
      var properties = _.clone(props);
      if (widget.ctrlWidget.getWidgetTagName() === 'twx-dt-label') {
        //Pass in default height when its non-upgraded label to match vf_ang behavior
        var height = properties.height;
        if (!height || height === 'NaN') {
          if (!properties.textattrs && !properties.textprops) {
            //No textattrs means its a 8.0.2 version compatible label
            properties.height = 0.05;
          }
        }
      }
      VF_ANG.drawTextToCanvas(canvas, widget.ctrlWidget.element(), properties);
      widget.ctrlWidget.totalHeight = properties.height;
    }

    // Grab the imageData from the canvas
    var imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Send the imageData to the App
    var nDataBytes = imageData.data.length * imageData.data.BYTES_PER_ELEMENT;
    var dataPtr = Module._malloc(nDataBytes);
    var dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, nDataBytes);
    dataHeap.set(new Uint8Array(imageData.data.buffer));
    widget.SetImage(dataHeap.byteOffset, imageData.width, imageData.height);

    // Free the imageData memory
    Module._free(dataHeap.byteOffset);

    // Notify the system that the image is loaded
    widget.ImageMarkerLoaded(true);
  }

  /**
   * Sets appropriate CSS and DOM properties on canvas context for text and image rendering
   * *Note this method should continue to be replaced with functions in vuforia-angular.js
   *
   * @param props Widget properties
   * @param image Optional image object to be drawn into the canvas
   * @param canvas dom element
   * @param context  canvas context element
   */
  function constructImageAndTextInfo(props, image, canvas, context, element, widget) {
    var textStyle;

    if ("textprops" in props) {
      textStyle = GetTextStyle(props.textprops);
    }
    else {
      textStyle = GetTextStyle(props.textattrs);

      if ("fontsize" in props && "font" in props) {
        textStyle.font = props.fontsize + " " + props.font;
      }
    }

    // Set widget specific properties
    var textx = 0, texty = 0;
    var imagex = 0, imagey = 0;
    var computedStyle = window.getComputedStyle(element[0]);
    var calculatedSizes = VF_ANG.calculateCssSizes(element, image, computedStyle, props.height, props.width);

    if (image && props.text) //Gauge
    {
      context.textBaseline = textStyle.textbaseline;
      context.textAlign = textStyle.textalign;
      adjustCanvasSize(props, canvas, context, image);
      textx = Number(props.textx);
      texty = Number(props.texty);
      imagex = Number(props.imagex);
      imagey = Number(props.imagey);
    }
    else if (image) { //Image
      var extraSize = 2 * (calculatedSizes.padding + calculatedSizes.borderWidth);
      //Calculated sizes won't work to size the image when both height and width are set and are not the same ratio
      //The image can get cut off.
      canvas.width = image.width + extraSize;
      canvas.height = image.height + extraSize;
      //console.log('image size', image.height, image.width, canvas.width, canvas.height,  calculatedSizes.height + extraSize,  calculatedSizes.width + extraSize, calculatedSizes.imagePhysicalWidth, calculatedSizes.imagePhysicalHeight)
      widget.ctrlWidget.totalHeight = calculatedSizes.imagePhysicalHeight;
      widget.ctrlWidget.totalWidth = calculatedSizes.imagePhysicalWidth;
      imagey = imagex = calculatedSizes.padding + calculatedSizes.borderWidth;
    }

    // Draw image on canvas
    if (image) {
      if (element[0].tagName === 'TWX-DT-IMAGE') { // No gauge for now
        VF_ANG.drawTextBorder(context, computedStyle, canvas.width, canvas.height, calculatedSizes.borderWidth);
      }
      context.drawImage(image, imagex, imagey);
    }

    // Draw text on canvas
    if (props.text) {
      if (textStyle.font) {
        context.font = textStyle.font;
      }

      context.textAlign = textStyle.textalign;
      context.textBaseline = textStyle.textbaseline;

      if (textStyle.fill !== undefined) {
        context.fillStyle = textStyle.fill;
        context.fillText(props.text, textx, texty);
      }
      if (textStyle.stroke !== undefined) {
        context.strokeStyle = textStyle.stroke;
        context.lineWidth = textStyle.lineWidth;
        context.strokeText(props.text, textx, texty);
      }
    }
  }

  function adjustCanvasSize(props, canvas, context, image) {
    var width = 0;
    var height = 0;

    function adjustToImage() {
      var imagex = Number(props.imagex);
      if (width < image.width + imagex) {
        width = image.width + imagex;
      }
      var imagey = Number(props.imagey);
      if (height < image.height + imagey) {
        height = image.height + imagey;
      }
    }

    function adjustToText() {
      context.font = props.fontsize + ' ' + props.font;
      var textBasedWidth = Number(props.textx) + context.measureText(props.text).width + 3;
      if (width < textBasedWidth) {
        width = textBasedWidth;
      }

      var textBasedHeight = Number(props.texty) + context.measureText('MI').width;
      if (height < textBasedHeight) {
        height = textBasedHeight;
      }
    }

    switch (props.canvasgrowthoverride) {
      case 'canvas':
      {
        width = props.canvaswidth;
        height = props.canvasheight;
        break;
      }
      case 'image':
      {
        adjustToImage();
        break;
      }
      case 'text':
      {
        adjustToText();
        break;
      }
      case 'image+text':
      {
        adjustToImage();
        adjustToText();
        break;
      }
      default:
        break;
    }

    props.canvaswidth = width;
    props.canvasheight = height;

    canvas.height = height;
    canvas.width = width;
  }

  /**
   * Gets a feature toggle setting from the passed scope.builderSettings
   *
   * @param {*} scope
   * @param {*} key
   */
  function getFeatureToggle(scope, key) {
     return scope && scope.builderSettings && scope.builderSettings[key];
  }

  function resizeFloor(session, floorsize, moveHeight) {
    if (session && floorsize)
    {
      var size = 1.0;
      var pos = { x: 0, y: -0.0001, z: 0 };
      var bbPos = pos;
      var bounds = session.GetWorldBoundingBox();
      if (bounds.valid) {
        var x = bounds.max.x - bounds.min.x;
        var y = bounds.max.y - bounds.min.y;
        var z = bounds.max.z - bounds.min.z;

        bbPos.x = bounds.min.x + (x / 2);
        bbPos.y = bounds.min.y + (y / 2);
        bbPos.z = bounds.min.z + (z / 2);

        var margin = Math.sqrt((x * x) + (y * y) + (z * z)) * 4;
        size = Math.sqrt((bbPos.x * bbPos.x) + (bbPos.y * bbPos.y) + (bbPos.z * bbPos.z)) * 2 + margin;

        if (moveHeight) {
          pos.y = bounds.min.y - 0.0001;
        } else {
          pos.y = - 0.0001;
        }

        // set a minimum floor size
        if (size < 1.0) {
          size = 1.0;
        }
      }

      var floor_resized = false;
      if (Math.abs(size - floorsize.size) > floorsize.size / 4.0) {
        floor_resized = true;
        floorsize.size = size;
      }

      var floor_moved = false;
      if ((Math.abs(pos.x - floorsize.pos.x) > floorsize.size / 4.0) ||
          (Math.abs(pos.z - floorsize.pos.z) > floorsize.size / 4.0) ||
          (pos.y !== floorsize.pos.y)) {
        floor_moved = true;
        floorsize.pos = pos;
      }

      if (floor_moved || floor_resized) {
        session.ShowFloorWithSize(true, floorsize.size, floorsize.size, floorsize.pos, 0x80808080, 0x80808080);
      }
    }
  }

  /**
    * Decode UTF8 strings into unicode.  Strings passed from ThingView are utf8
    *
    * @param {string} s the utf8 encoded string
    * @returns {string} the string as unicode
    */
  function decodeUtf8(s) { // jshint ignore:line
    return decodeURIComponent(escape(s));
  }

  function rgbaToInteger(color) {
    var rgba = color.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
    var int = -1;
    if (rgba) {
      int  = Number(rgba[1]) * 0x1000000;
      int += Number(rgba[2]) * 0x0010000;
      int += Number(rgba[3]) * 0x0000100;
      int += Number(rgba[4]);
    }
    return int;
  }

  /**
    * Parse boolean values expressed as a string
    *
    * @param {string or bool} the supplied value, as a string or boolean
    * @returns {bool} the boolean result
    */
  function parseBool(b) {
    let result = false;
    if (typeof b === 'string') {
      if (b.toLowerCase() === 'true') {
        result = true;
      }
    }
    else if (b) {
      result = true;
    }

    return result;
  }

  /**
    * Get the name of the ThingView Model's sequence, given its URL
    *
    * @param {string} url the url of the sequence
    * @param {object} The ThingView Model containing the sequence
    * @returns {string} the name of the sequence
    */
  function GetSequenceNamefromUrl(url, model)
  {
    let name = '';
    let seqURL = decodeURI(url);
    seqURL = seqURL.slice(seqURL.lastIndexOf('/') + 1);
    let illustrations = model.GetIllustrations();
    for (let i = 0; i < illustrations.size() ; i++) {
      var illustration = illustrations.get(i);
      if (decodeUtf8(illustration.filename) === seqURL) {
        name = illustration.name;
        break;
      }
    }

    return name;
  }

  twxWidgets.getFeatureToggle = getFeatureToggle;
  twxWidgets.adjustCanvasSize = adjustCanvasSize;
  twxWidgets.handleDefaultImage = handleDefaultImage;
  twxWidgets.isSVG = isSVG;
}());

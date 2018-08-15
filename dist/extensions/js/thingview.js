"use strict";

var Module = {
    'locateFile': function (name) {
        return ThingView.modulePath + name;
    },
    onRuntimeInitialized : function () {
        ThingView.loaded = true;
        if (!(ThingView.initCB == undefined)) {
            ThingView._completeInit();
            ThingView._setResourcePath(ThingView.resourcePath);
            ThingView.LoadPreferences(function(jsonObj, defaultPrefs) {
                if (jsonObj !== undefined) {
                    ThingView.StorePreferences(jsonObj, defaultPrefs);
                    _addPreferenceEvents();
                }
                if (ThingView.initCB) {
                    ThingView.initCB();
                }
            });
        }
    }
};

function FailedLoad()
{
    window.alert("In FailedLoad");
}
var ThingView = (function () {
    var id = 0;
    var thingView;
    var isUpdated = false;
    var _currentSession = null;
    var _currentCanvasId = "";
    var _viewable = null;
    var _nextCanvasId = 0;
    var resourcePath = null;
    var loadedPreferences = {};
    var defaultPreferences = {};
    var s_fileversion = "0.22.0.99";
    var s_productversion = "0.22.0-ci+99";
    var s_productname = "ThingView 0.22";
    var __PDF_DOC = null;
    var __CANVAS = null;
    var __CANVAS_CTX = null;
    var __CURRENT_PAGE = 0;
    var __TOTAL_PAGES = 0;
    var __ZOOMSCALE = 1;
    var doCapture = false;
    var captureWrapper;
    var requestID = null;
    var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    var edge = /Edge\/\d+/.test(navigator.userAgent);

    // Preference names
    var s_pref_nav_navmode = "Nav.NavMode";
    var s_pref_gen_filecache = "Gen.FileCache";
    var s_pref_gen_filecachesize = "Gen.FileCacheSize";

    var returnObj = {
        init: function (path, initCB) {
            ThingView.resourcePath = path;
            ThingView.initCB = initCB;
            if (ThingView.loaded) {
                ThingView._completeInit();
                ThingView.LoadPreferences(function(jsonObj, defaultPrefs) {
                    if (jsonObj !== undefined) {
                        ThingView.StorePreferences(jsonObj, defaultPrefs);
                        _addPreferenceEvents();
                    }
                    if (ThingView.initCB) {
                        ThingView.initCB();
                    }
                });
            }
            else {
                var head = document.getElementsByTagName('head').item(0);
                ThingView.id = document.createElement("SCRIPT");
                var loaderLib;
                if ( (typeof(WebAssembly) == "undefined") || (iOS == true) || (edge == true))
                    loaderLib = "libthingview.js";
                else
                {
                    loaderLib = "libthingview_wasm.js";
                    ThingView.id.onerror = this.failedWasmLoad;
                }

                if (path) {
                    var idx = path.lastIndexOf('/');
                    if ((idx == -1) ||  (idx < path.length-1))
                        path += "/";
                    loaderLib = path + loaderLib;
                    ThingView.modulePath = path;
                }
                ThingView.id.src = loaderLib;
                head.appendChild(ThingView.id);

            }
        },
        failedWasmLoad: function() {
            console.log("Failed loading wasm so try asmjs");
            var head = document.getElementsByTagName('head').item(0);

            var id = document.createElement("SCRIPT");
            id.src =ThingView.modulePath + "libthingview.js";
            head.appendChild(id);

        },
        GetVersion: function() {
            return s_version;
        },

        GetDateCode: function() {
                return thingView.GetDateCode();
        },
        GetFileVersion: function() {
            return s_fileversion;
        },
        _completeInit: function () {
            thingView = Module.ThingView.GetThingView();
            if (requestID == null)
                requestID = requestAnimationFrame(_DoRender);
        },
        _setResourcePath: function(path) {
            thingView.SetResourcePath(path);
        },
        SetInitFlags: function (flags) {
            thingView.SetInitFlags(flags);
        },
        LoadImage: function (imagename) {
            thingView.LoadImage(imagename);
        },
        CreateSession: function(parentCanvasId) {
            var session = _createSession(parentCanvasId);
            if (ThingView.loadedPreferences) {
                if (Object.keys(ThingView.loadedPreferences).length > 0) {
                    _applyPreferences(session, ThingView.loadedPreferences);
                }
            }
            return session;
        },
        SetHighMemoryUsageValue: function (megaBytes) {
            thingView.SetHighMemoryUsageValue(megaBytes);
        },        
        LoadDocument: function (viewable, parentCanvasId, model, callback){
          _LoadDocument(viewable, parentCanvasId, model, callback);  
        },
        IsDocumentSession: function() {
            return _IsDocumentSession();
        },
        IsSVGSession: function() {
            return _IsSVGSession();
        },
        ClearCanvas: function (){
            _ClearCanvas();
        },
        LoadPrevPage: function (callback) {
            _LoadPrevPage(callback);
        },
        LoadNextPage: function (callback) {
            _LoadNextPage(callback);
        },
        LoadPage: function (callback, pageNo) {
            _LoadPage(callback, pageNo);
        },
        EnableSession: function(session) {
            _enableSession(session);
        },
        DeleteSession: function(session) {
            _deleteSession(session);
        },
        Hide3DCanvas: function(session) {
          _hide3DCanvas(session);  
        },
        Show3DCanvas: function(session) {
          _show3DCanvas(session);  
        },
        Destroy2DCanvas: function() {
            _destroy2DCanvas();
        },
        OpenPreferencesDialog: function() {
            window.open(ThingView.modulePath + "preferences.html", "ThingView Preferences", "width=500, height=250, status=no, toolbar=no, menubar=no, location=no");
        },
        StorePreferences: function(jsonObj, defaultPrefs) {
            try {
                if (!(jsonObj == undefined)) {
                    ThingView.loadedPreferences = jsonObj;
                }
                if (!(defaultPrefs == undefined)) {
                    ThingView.defaultPreferences = defaultPrefs;
                }
            } catch (e) {
                console.log("StorePreferences, exception: " + e);
            }
        },
        LoadPreferences: function(callbackFunc) {
            _loadPreferences(function(jsonObj, defaultPrefs) {
                callbackFunc(jsonObj, defaultPrefs);
            });
        },
        ApplyPreferences: function(jsonObj) {
            _applyPreferences(_currentSession, jsonObj);
        },
        SavePreferences: function(jsonObj) {
        },
        GetLoadedPreferences: function() {
            return _getLoadedPreferences();
        },
        CaptureCanvas: function(captureFunc) {
            doCapture = true;
            captureWrapper = captureFunc;
        }
    };
    return returnObj;// End of public functions

    function _DoRender(timeStamp) {
        var doRender = true;
        try
        {
            if((doCapture === true) && (captureWrapper !== undefined) && (captureWrapper instanceof Function)) {
                doCapture = false;
                captureWrapper(function() {
                    thingView.DoRender(timeStamp);
                });
            } else {
                thingView.DoRender(timeStamp);
            }
        } catch (err)
        {
            console.log("Javascript caught exception "+ err);
            doRender = false;
        }
        if (doRender)
            requestID = requestAnimationFrame(_DoRender);
    }

    function _createSession(parentCanvasId)
    {
        var sessionCanvas = document.createElement("canvas");
        var parent = document.getElementById(parentCanvasId);
        sessionCanvas.id = parentCanvasId + "_CreoViewCanvas" + _nextCanvasId;
        _nextCanvasId++;
        sessionCanvas.setAttribute('style', "position: relative; width: 100%; height: 100%");

        var width = parent.clientWidth;
        var height = parent.clientHeight;

        sessionCanvas.width = width;
        sessionCanvas.height = height;
        parent.insertBefore(sessionCanvas, parent.childNodes[0]);

        sessionCanvas.oncontextmenu = function (e) {
            e.preventDefault();
            return false;
        };

        _currentSession = thingView.CreateSession(sessionCanvas.id);
        return _currentSession;
    }
    
    function _LoadDocument(viewable, parentCanvasId, model, callback){
        if(viewable && model){
            if(viewable.type=="pdf"){
                if (!_IsDocumentSession()){
                    _createDocumentSession(parentCanvasId);
                }
                var name = viewable.name;
                model.GetFromLoadedDataSource(viewable.idPath, viewable.index, function(val){
                    _LoadPDF(val, name, callback)
                });
            }
            else if (viewable.type=="svg"){
                if(!_IsSVGSession()){
                    _createSVGSession(parentCanvasId);
                }
                model.GetFromLoadedDataSource(viewable.idPath, viewable.index, function(val){
                    _LoadSVG(val);
                });
            }
        }
    }

    function _createDocumentSession(parentCanvasId) {
        
        if(_IsSVGSession()){
            _destroy2DCanvas();
        }
        else if (!_IsDocumentSession()){
            _hide3DCanvas(_currentSession);
        }
        var head = document.getElementsByTagName('head').item(0);
        if (!document.getElementById("pdfjs")) {
            var script_pdf = document.createElement("SCRIPT");
            script_pdf.src = ThingView.modulePath + "pdfjs/pdf.js";
            script_pdf.id = "pdfjs";
            script_pdf.async = false;
            head.appendChild(script_pdf);

            script_pdf.onload = function() {
                _buildDocumentSession(parentCanvasId);
            }
        } else {
            _buildDocumentSession(parentCanvasId);
        }
        return;
    }
    
    function _buildDocumentSession(parentCanvasId){
        _currentCanvasId = "";
        var sessionCanvas = document.createElement("canvas");
        var context = sessionCanvas.getContext('2d');
        var parent = document.getElementById(parentCanvasId);
        sessionCanvas.id = parentCanvasId + "_CreoViewDocumentCanvas" + _nextCanvasId;
        _nextCanvasId++;
        sessionCanvas.setAttribute('style', "position: relative; width: 100%; height: 100%");
        var width = parent.clientWidth;
        var height = parent.clientHeight;
        sessionCanvas.width = width;
        sessionCanvas.height = height;
        parent.insertBefore(sessionCanvas, parent.childNodes[0]);
        sessionCanvas.oncontextmenu = function (e) {
            e.preventDefault();
            return false;
        };
        _currentCanvasId = sessionCanvas.id;
        return;
    }
    
    function _createSVGSession(parentCanvasId){
        if(_IsDocumentSession()){
            _destroy2DCanvas();
        }
        else if (!_IsSVGSession()){
            _hide3DCanvas(_currentSession);
        }
        _currentCanvasId = "";
        var sessionObject = document.createElement("div");
        var parent = document.getElementById(parentCanvasId);
        sessionObject.id = parentCanvasId + "_CreoViewSVGDiv" + _nextCanvasId;
        _nextCanvasId++;
        var width = parent.clientWidth;
        var height = parent.clientHeight;
        sessionObject.width = width;
        sessionObject.height = height;
        sessionObject.setAttribute('style',"overflow: hidden");
        
        var windowWidth = window.innerWidth;
        var windowHeight = window.innerHeight;
        
        parent.setAttribute('style', "overflow: hidden");
        var svgHolder = document.createElement("div");
        svgHolder.setAttribute("type", "image/svg+xml");
        
        var drag = {
            x: 0,
            y: 0,
            state: false
        };
        var delta = {
            x: 0,
            y: 0
        };
        
        svgHolder.addEventListener("wheel", _zoomOnSVG);
        svgHolder.addEventListener("mousedown", function(e){
            e.preventDefault();
            if(!drag.state && e.which==1){
                drag.x = e.pageX;
                drag.y = e.pageY;
                drag.state = true;
            }
        });
        svgHolder.addEventListener("mouseup", function(){
            if(drag.state){
                drag.state = false;
            }
        });
        svgHolder.addEventListener("mousemove", function(e){
            if(drag.state){
                _panSVG(e, drag, delta);
            }
        })
        
        sessionObject.insertBefore(svgHolder, sessionObject.childNodes[0]);
        svgHolder.setAttribute('style',"height: inherit; width: inherit");
        parent.insertBefore(sessionObject, parent.childNodes[0]);
        _currentCanvasId = sessionObject.id;
        return;
        }
        
    function _getTransformMatrix(svgHolder){
        var svgTransform = getComputedStyle(svgHolder).getPropertyValue('transform');
        
        if(svgTransform=="none"){
            svgTransform = "matrix(1, 0, 0, 1, 0, 0)";
        }
        //Convert the matrix into usable values.
        var matrix = svgTransform.replace(/[^\d.,-]/g, '').split(',').map(Number);
        return matrix;
    }
    
    function _panSVG(e, drag, delta){
        e.preventDefault();
        
        var canvasId = _currentCanvasId;
        var svgHolder = document.getElementById(canvasId).childNodes[0];
        
        delta.x = e.pageX - drag.x;
        delta.y = e.pageY - drag.y;
        
        var matrix = _getTransformMatrix(svgHolder);
        
        var newTranslateX = matrix[4];
        newTranslateX += delta.x;
        
        var newTranslateY = matrix[5];
        newTranslateY += delta.y;
        
        var newTransform = "transform: matrix(" + matrix[0] + "," + matrix[1] + "," + matrix[2] + "," + matrix[3] + "," + newTranslateX + "," + newTranslateY + ")";
        svgHolder.setAttribute('style', newTransform);
        
        drag.x = e.pageX;
        drag.y = e.pageY;
    }
    
    function _zoomOnSVG(e){
        var canvasId = _currentCanvasId;
        var svgObject = document.getElementById(canvasId);
        var svgHolder = svgObject.childNodes[0];
        
        var centerX = (svgObject.getBoundingClientRect().left + svgObject.getBoundingClientRect().right)/2
        var centerY = (svgObject.getBoundingClientRect().top + svgObject.getBoundingClientRect().bottom)/2;
        
        var mouseDeltaX = (e.pageX - centerX)/2;
        var mouseDeltaY = (e.pageY - centerY)/2;
        console.log("(" + mouseDeltaX + "," + mouseDeltaY + ")");
        
        var _ZOOMMODIFIER = 0.15
        var _MAXZOOM = 10.0
        var _MINZOOM = 0.15
        var matrix = _getTransformMatrix(svgHolder);
        
        var newTranslateX = matrix[4];
        newTranslateX -= mouseDeltaX;
        
        var newTranslateY = matrix[5];
        newTranslateY -= mouseDeltaY;
        
        if(e.deltaY > 0){
            var newScale = matrix[0] + _ZOOMMODIFIER;
            if(newScale <= _MAXZOOM){
                var newTransform = "transform: matrix(" + newScale + "," + matrix[1] + "," + matrix[2] + "," + newScale + "," + newTranslateX + "," + newTranslateY + ")";
                svgHolder.setAttribute('style', newTransform);
            }
        }
        else{
            var newScale = matrix[0] - _ZOOMMODIFIER;
            if(newScale >= _MINZOOM){
                var newTransform = "transform: matrix(" + newScale + "," + matrix[1] + "," + matrix[2] + "," + newScale + "," + newTranslateX + "," + newTranslateY + ")";
                svgHolder.setAttribute('style', newTransform);
            }
        }
    }
    
    function _IsDocumentSession()
    {
        var retVal = false;
        if (!_currentCanvasId=="") {
            retVal = _currentCanvasId.includes("_CreoViewDocumentCanvas") ;
        }
        return retVal;
    }
    
    function _IsSVGSession()
    {
        var retVal = false;
        if (!_currentCanvasId=="") {
            retVal = _currentCanvasId.includes("_CreoViewSVGDiv") ;
        }
        return retVal;
    }
    
    function _ClearCanvas() {
        if (_IsDocumentSession()) {
            var session_html = Module.castToSession_html(_currentSession);
            var canvasId = session_html.GetCanvasName();
            var canvas = document.getElementById(canvasId);
            var context = canvas.getContext('2d');
            if (context) {
                context.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
    function _LoadPDF(val, documentName, callback)
    {
        if(_IsDocumentSession() && val) {
            var canvasId = _currentCanvasId;
            var canvas = document.getElementById(canvasId);
            var context = canvas.getContext('2d');
            if (context) {
                __CANVAS = canvas;
                __CANVAS_CTX = context;
                if (val) {
                    showPDF(val, documentName, callback);
                }
            }
        }
    }
    
    function _LoadSVG(val){
    
        if(_IsSVGSession())
        {
            var canvasId = _currentCanvasId;
            var svgObject = document.getElementById(canvasId).childNodes[0];       
            svgObject.innerHTML = val;
        }
    }

    
    function showPDF(val, documentName, callback) {
        PDFJS.getDocument({ data: val }).then(function (pdf_doc) {
            __PDF_DOC = pdf_doc;
            __TOTAL_PAGES = __PDF_DOC.numPages;
            // Show the first page
            showPage(1, documentName, callback);
        }).catch(function (error) {
            console.log("Javascript caught exception in showPDF : " + error.message);
            if (typeof callback === "function") callback(false, null);
        });
    }
    function showPage(page_no, documentName, callback) {
        __CURRENT_PAGE = page_no;
        // Fetch the page
        __PDF_DOC.getPage(page_no).then(function (page) {
            // As the canvas is of a fixed width we need to set the scale of the viewport accordingly
            var scale_required = __CANVAS.width / page.getViewport(1).width;
            //scale_required = scale_required * __ZOOMSCALE;
            // Get viewport of the page at required scale
            var viewport = page.getViewport(scale_required);
            // Set canvas height
            __CANVAS.height = viewport.height;
            var renderContext = {
                canvasContext: __CANVAS_CTX,
                viewport: viewport
            };
            console.log("Canvas Height/Widht Reset: " + __CANVAS.height + " / " + __CANVAS.width);
            var renderTask = page.render(renderContext);
            // Render the page contents in the canvas
            renderTask.promise.then(function () {
                if (typeof callback === "function") callback(true, documentName, __CURRENT_PAGE, __TOTAL_PAGES);
            }).catch(function (error) {
                console.log("Javascript caught exception in showPage : " + error.message);
                if (typeof callback === "function") callback(false, documentName, 0, 0);
            });
        });
    }
    function _LoadPrevPage(callback) {
        if (__CURRENT_PAGE != 1)
            showPage(--__CURRENT_PAGE, null, callback);
    }
    function _LoadNextPage(callback) {
        if (__CURRENT_PAGE != __TOTAL_PAGES)
            showPage(++__CURRENT_PAGE, null, callback);
    }
    function _LoadPage(callback, pageNo) {
        if ((pageNo > 0) && (pageNo <=__TOTAL_PAGES))
            showPage(pageNo, null, callback);
    }
    function _enableSession(session)
    {
        if (_currentSession != null)
        {
            _currentSession.Disable();
        }
        session.Enable();
        _currentSession = session;
    }

    function _deleteSession(session) {
        if (_currentSession == session) {
            _currentSession = null;
        }
        var session_html = Module.castToSession_html(session);
        var canvasId = session_html.GetCanvasName();
        var canvas = document.getElementById(canvasId);
        session.delete();
        session_html.delete();
        if (canvas != null && canvas.parentElement != null)
            canvas.parentElement.removeChild(canvas);

    }
    
    function _hide3DCanvas(session){
        var session_html = Module.castToSession_html(session);
        var canvasId = session_html.GetCanvasName();
        var canvas = document.getElementById(canvasId);
        canvas.setAttribute('style', "width: 0%; height: 0%");
    }
    
    function _show3DCanvas(session){
        var session_html = Module.castToSession_html(session);
        var canvasId = session_html.GetCanvasName();
        var canvas = document.getElementById(canvasId);
        canvas.setAttribute('style', "width: 100%; height: 100%");
        requestID = requestAnimationFrame(_DoRender);
    }
    
    function _destroy2DCanvas(){
        var currentCanvas =  document.getElementById(_currentCanvasId);
        currentCanvas.height = 0;
        currentCanvas.width = 0;
        var parent = currentCanvas.parentNode;
        parent.removeChild(currentCanvas);
        _currentCanvasId = "";
    }

    function _loadPreferences(callback) {
        callback();
    }

    function _applyPreferences(session, jsonObj) {
        try {
        if (session == null)
            return;
        if (jsonObj !== undefined) {
            for (key in jsonObj) {
                if (ThingView.loadedPreferences === undefined)
                    ThingView.loadedPreferences = {};
                ThingView.loadedPreferences[key] = jsonObj[key];

                var fileCacheEnabled = false;
                var fileCacheSize = 0;

                if (key == s_pref_nav_navmode) {
                    if (jsonObj[key] == "CREO_VIEW") {
                        session.SetUpDirection("Y");
                        session.SetNavigationMode(Module.NavMode.CREO_VIEW);
                        if (!session.IsOrthographic())
                            session.SetOrthographicProjection(1.0);
                    }
                    else if (jsonObj[key] == "CREO") {
                        session.SetUpDirection("Y");
                        session.SetNavigationMode(Module.NavMode.CREO);
                        if (!session.IsOrthographic())
                            session.SetOrthographicProjection(1.0);
                    }
                    else if (jsonObj[key] == "CATIA") {
                        session.SetUpDirection("Y");
                        session.SetNavigationMode(Module.NavMode.CATIA);
                        if (!session.IsOrthographic())
                            session.SetOrthographicProjection(1.0);
                    }
                    else if (jsonObj[key] == "EXPLORE") {
                        session.SetUpDirection("Z");
                        session.SetNavigationMode(Module.NavMode.EXPLORE);
                        if (!session.IsPerspective())
                            session.SetPerspectiveProjection(60.0);
                    }
                    else if (jsonObj[key] == "MOCKUP")
                        session.SetNavigationMode(Module.NavMode.MOCKUP);
                    else if (jsonObj[key] == "VUFORIA")
                        session.SetNavigationMode(Module.NavMode.VUFORIA);
                    else if (jsonObj[key] == "VUFORIA_NOPICK")
                        session.SetNavigationMode(Module.NavMode.VUFORIA_NOPICK);
                } else if (key == s_pref_gen_filecache) {
                    if (jsonObj[key] === true)
                        fileCacheEnabled = true;
                } else if (key == s_pref_gen_filecachesize) {
                    fileCacheSize = jsonObj[key];
                }
                //if (fileCacheEnabled)
                  //  session.EnableFileCache(fileCacheSize);
            }
        }
        } catch (e) {
            console.log(e);
        }
    }

    function _getLoadedPreferences() {
        if (ThingView.loadedPreferences) {
            if (Object.keys(ThingView.loadedPreferences).length > 0) {
                return ThingView.loadedPreferences;
            }
        }
        return {};
    }

})();

function _addPreferenceEvents() {
    var re = new RegExp("version\\/(\\d+).+?safari", "i");
    var safari = navigator.userAgent.match(re);
    document.addEventListener("keydown", function(event) {
        if (safari) {
            if (event.ctrlKey && event.code == 'KeyP') {
                ThingView.OpenPreferencesDialog();
            }
        } else {
            if (event.shiftKey && (event.code == 'KeyP' || event.keyCode == 80 /*P*/)) {
                ThingView.OpenPreferencesDialog();
            }
        }
    }, false);

    window.addEventListener("storage", function(event) {
        if (event.key == 'msgPref') {
            if (event.newValue) {
                var message = JSON.parse(event.newValue);
                ThingView.ApplyPreferences(message);
                ThingView.SavePreferences(ThingView.GetLoadedPreferences());
            }
        } else if (event.key == 'resetPref') {
            if (event.newValue && event.newValue == 'true') {
                ThingView.loadedPreferences = {};
                ThingView.ApplyPreferences(ThingView.defaultPreferences);
                ThingView.SavePreferences(ThingView.GetLoadedPreferences());
            }
        } else if (event.key == 'msgReady') {
            if (event.newValue && event.newValue == 'true') {
                localStorage.setItem('msgCurPref', JSON.stringify(ThingView.loadedPreferences));
                localStorage.removeItem('msgCurPref');
                localStorage.setItem('msgDefPref', JSON.stringify(ThingView.defaultPreferences));
                localStorage.removeItem('msgDefPref');
            }
        }
    }, false);
}

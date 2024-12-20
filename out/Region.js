var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Err } from "./Err.js";
import { Check } from "./Check.js";
//. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
export class Region {
    constructor(name = "", imageLoc = "", x = 0, y = 0, w = -1, // -1 here implies we resize based on image
    h = -1, // -1 here implies we resize base on image) 
    canvas, parent) {
        // check if we are drawing or not (determine if mouse move should trigger draw)
        this._drawingLine = false;
        // record previous cursor location (where the current stroke start)
        this._cursorX = -1;
        this._cursorY = -1;
        // right click menu, initialize with default
        this.currentStrokeSize = 1;
        this.currentColor = '#000000';
        this._name = name;
        this._parent = parent;
        this._imageLoc = imageLoc;
        this._canvas = canvas;
        // check if the listeners are setted for drawing
        this._setted = false;
        // to recognize what tool we are using right now
        this._tool = "";
        // reserved space for listener (in order to refer when remove)
        this._onMouseDownBound = (evt) => null;
        this._onMouseMoveBound = (evt) => null;
        this._onMouseUpBound = (evt) => null;
        // initialize buffer canvas
        this._bufferCanvas = document.createElement("canvas");
        this._bufferCanvas.width = canvas.canvas.width;
        this._bufferCanvas.height = canvas.canvas.height;
        this._bufferContext = this._bufferCanvas.getContext("2d");
        // if either of the sizes is -1, we set to resize based on the image
        this._resizedByImage = ((w < 0) || (h < 0));
        // -1 size defaults to 0 (but replaced on load)
        w = (w < 0) ? 0 : w;
        h = (h < 0) ? 0 : h;
        this._x = x;
        this._y = y;
        this._w = w;
        this._h = h;
        // start the image loading;  this.damage() will be called asynchonously 
        // when that is complete
        this._loaded = false;
        this._loadError = false;
        this._startImageLoad();
    }
    // Construct a Region from a Region_json object, checking all the parts (since data 
    // coming from json parsing lives in javascript land and may not actually be typed
    // at runtime as we think/hope it is).
    static fromJson(reg, canvas, parent) {
        var _a, _b, _c, _d, _e;
        const name = reg.name;
        const x = Check.numberVal((_a = reg.x) !== null && _a !== void 0 ? _a : 0, "Region.fromJson{x:}");
        const y = Check.numberVal((_b = reg.y) !== null && _b !== void 0 ? _b : 0, "Region.fromJson{y:}");
        const w = Check.numberVal((_c = reg.w) !== null && _c !== void 0 ? _c : -1, "Region.fromJson{w:}");
        const h = Check.numberVal((_d = reg.h) !== null && _d !== void 0 ? _d : -1, "Region.fromJson{h:}");
        const imageLoc = Check.stringVal((_e = reg.imageLoc) !== null && _e !== void 0 ? _e : "", "Region.fromJson{imageLoc:}");
        return new Region(name, imageLoc, x, y, w, h, canvas, parent);
    }
    // set up listeners and initialize when select a new brush
    _setupCanvasEventHandlers(tool) {
        this.setted = true;
        // set the tool value to current tool
        this._tool = tool;
        // Bind the methods so we can add and remove the exact same references
        this._onMouseDownBound = (evt) => this._onMouseDown(evt, tool);
        this._onMouseMoveBound = (evt) => this._onMouseMove(evt, tool);
        this._onMouseUpBound = (evt) => this._onMouseUp(evt);
        // Set up listener
        this.canvas.canvas.addEventListener("mousedown", this._onMouseDownBound);
        this.canvas.canvas.addEventListener("mousemove", this._onMouseMoveBound);
        this.canvas.canvas.addEventListener("mouseup", this._onMouseUpBound);
    }
    // remove the current listeners
    removeListeners() {
        // Ensure listeners are removed using the bound references
        this.canvas.canvas.removeEventListener("mousedown", this._onMouseDownBound);
        this.canvas.canvas.removeEventListener("mousemove", this._onMouseMoveBound);
        this.canvas.canvas.removeEventListener("mouseup", this._onMouseUpBound);
        // set back to default (no brushes status)
        this._tool = "";
        this._drawingLine = false;
        this.setted = false;
        // make cursor X, Y negative to indicate there's no current stroke
        this._cursorX = -1;
        this._cursorY = -1;
    }
    _onMouseDown(evt, tool) {
        console.log("mouse down:", tool, evt.offsetX, evt.offsetY);
        // indicate we are currently drawing a line
        this._drawingLine = true;
        // set the start point of current stroke
        this._cursorX = evt.offsetX;
        this._cursorY = evt.offsetY;
    }
    _onMouseMove(evt, tool) {
        console.log("mouse move:", evt.offsetX, evt.offsetY);
        // sometimes the mouse down is not detected for the first press on canvas right after select brush, 
        // as it is  used to indicate drawing start and set the listeners. 
        // If so, we need to update when it sense the first move
        if (this._cursorX === -1) {
            this._cursorX = evt.offsetX;
            this._cursorY = evt.offsetY;
            this._drawingLine = true;
        }
        // if we are not drawing (no pressed, simply moving on canvas)
        if (!this._drawingLine || this._tool === "") {
            return;
        }
        // set ctx to the root canvas
        const ctx = this.canvas;
        if (ctx) {
            // Clear the canvas on every move to update the current stroke
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            // redraw previous drawings from buffer
            ctx.drawImage(this._bufferCanvas, 0, 0);
            if ((tool === 'erase') || (tool === 'free')) {
                // if it's erasing/free drawing, we directly update on buffer canvas, don't remove adjustions
                this.drawTools(this._bufferContext, evt);
            }
            else {
                // do the current stroke on ctx
                this.drawTools(ctx, evt);
            }
        }
    }
    _onMouseUp(evt) {
        console.log("mouse up:", evt.offsetX, evt.offsetY);
        // indicate finished a stroke
        this._drawingLine = false;
        // Save final stroke to buffer canvas
        this.drawTools(this._bufferContext, evt);
    }
    // handle the drawing according to current tool
    drawTools(ctx, evt) {
        // set color and stroke size
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentStrokeSize;
        // switch according to current brush
        switch (this._tool) {
            // draw straight line
            case "line":
                ctx.beginPath();
                ctx.moveTo(this._cursorX, this._cursorY);
                ctx.lineTo(evt.offsetX, evt.offsetY);
                ctx.stroke();
                ctx.closePath();
                break;
            case "rect":
                // draw rectangle, size according to mouse move
                const width = evt.offsetX - this._cursorX;
                const height = evt.offsetY - this._cursorY;
                ctx.strokeRect(this._cursorX, this._cursorY, width, height);
                break;
            case "circle":
                // draw ellipse
                ctx.beginPath();
                let w = evt.offsetX - this._cursorX;
                let h = evt.offsetY - this._cursorY;
                if (w < 0)
                    w = 0 - w;
                if (h < 0)
                    h = 0 - h;
                ctx.ellipse(this._cursorX, this._cursorY, w, h, Math.PI / 4, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            case "erase":
                // erase, enabled by white paint
                ctx.strokeStyle = "white";
                ctx.beginPath();
                ctx.moveTo(this._cursorX, this._cursorY);
                ctx.lineTo(evt.offsetX, evt.offsetY);
                ctx.stroke();
                ctx.closePath();
                this._cursorX = evt.offsetX;
                this._cursorY = evt.offsetY;
                break;
            case "free":
                // free drawing, continuously updating start point as moving
                ctx.beginPath();
                ctx.moveTo(this._cursorX, this._cursorY);
                ctx.lineTo(evt.offsetX, evt.offsetY);
                ctx.stroke();
                ctx.closePath();
                this._cursorX = evt.offsetX;
                this._cursorY = evt.offsetY;
                break;
        }
    }
    // show color wheel and stroke size adjustion menu
    showColorWheel(evt) {
        //  using HTMLelement div block for UI
        // big container for color wheel and stroke slider
        const container = document.createElement('div');
        container.id = 'color-wheel-container';
        container.style.position = 'absolute';
        container.style.background = 'grey';
        container.style.border = '1px solid black';
        container.style.padding = '10px';
        container.style.borderRadius = '5px';
        // show the UI next to the current cursor location
        if (evt) {
            container.style.left = `${evt.offsetX + 10}px`;
            container.style.top = `${evt.offsetY + 10}px`;
        }
        else {
            container.style.left = `${this.x}px`; // Default position
            container.style.top = `${this.y}px`;
        }
        // color options
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000'];
        // container for color options
        const colorContainer = document.createElement('div');
        colorContainer.style.display = 'flex';
        colorContainer.style.justifyContent = 'space-around';
        colorContainer.style.marginBottom = '10px';
        // for each color, create a div box for it
        colors.forEach(color => {
            const colorBox = document.createElement('div');
            colorBox.style.width = '30px';
            colorBox.style.height = '30px';
            colorBox.style.backgroundColor = color;
            // make the cursor point to it to inicate selectable
            colorBox.style.cursor = 'pointer';
            // disappear after click (select this color) or click outside (cancel)
            colorBox.addEventListener('click', () => {
                this.currentColor = color;
                container.remove();
                document.removeEventListener('click', outsideClickListener);
            });
            // put the box into color container
            colorContainer.appendChild(colorBox);
        });
        // attach color wheel UI to the big menu
        container.appendChild(colorContainer);
        // stroke size slider
        // write a label to tell user what this is
        const sizeLabel = document.createElement('label');
        sizeLabel.style.color = "white";
        sizeLabel.textContent = 'Stroke Size: ';
        sizeLabel.style.display = 'block';
        sizeLabel.style.marginBottom = '5px';
        // create UI for the input slider
        const sizeInput = document.createElement('input');
        sizeInput.type = 'range';
        sizeInput.min = '1';
        sizeInput.max = '20';
        // indicate where we are currently (the current stroke size)
        sizeInput.value = `${this.currentStrokeSize}`;
        sizeInput.style.width = '100%';
        // listen to what value the user select and set the stroke
        sizeInput.addEventListener('input', () => {
            const size = parseInt(sizeInput.value, 10);
            this.currentStrokeSize = size;
        });
        // if mouseup (finish moving slide, selected a size), remove the UI
        sizeInput.addEventListener('mouseup', () => {
            container.remove();
            document.removeEventListener('click', outsideClickListener);
        });
        // put these elements into the big menu UI
        container.appendChild(sizeLabel);
        container.appendChild(sizeInput);
        document.body.appendChild(container);
        // the function to check if there is a click outside the UI
        // if happen, remove the UI
        const outsideClickListener = (event) => {
            // if click on the selectable targets, discard
            if (!container.contains(event.target)) {
                container.remove();
                // Cleanup event listener
                document.removeEventListener('click', outsideClickListener);
            }
        };
        // add listener to the canvas
        document.addEventListener('click', outsideClickListener);
    }
    // when press on moving icon, we can move the menu
    moveMenu(regionLs) {
        // store the start place of movement
        let startX = 0;
        let startY = 0;
        // indicate if we are dragging the menu
        let dragging = false;
        // store the initial positions of regions
        const initialPositions = [];
        // if the target we are dragging is an interactive element, then we are not moving the menu
        const isInteractiveElement = (target) => {
            if (!target || !(target instanceof HTMLElement))
                return false;
            return (target.tagName === "INPUT");
        };
        // Mouse down: Start tracking the drag
        const onMouseDown = (evt) => {
            // Ignore the event if it starts on an interactive element
            if (isInteractiveElement(evt.target))
                return;
            dragging = true;
            // record the start place
            startX = evt.clientX;
            startY = evt.clientY;
            // Record the initial positions of all regions
            initialPositions.length = 0;
            for (const region of regionLs) {
                // we don't modify canvas' position, just regions in menu bar
                if (region.name === "canvas") {
                    continue;
                }
                // for each region, record its initial x and y
                initialPositions.push({ region, x: region._x, y: region._y });
            }
            // Prevent unintended browser behavior
            evt.preventDefault();
        };
        // Mouse move: Update the positions of the regions
        const onMouseMove = (evt) => {
            if (!dragging)
                return;
            // calculate the offset in position
            const offsetX = evt.clientX - startX;
            const offsetY = evt.clientY - startY;
            // Update each region's position relative to the drag offset
            for (const entry of initialPositions) {
                const { region, x, y } = entry;
                region._x = x + offsetX;
                region._y = y + offsetY;
            }
            // redraw the regions
            this.redrawRegions(regionLs);
        };
        // Mouse up: Finalize the drag and stop tracking
        const onMouseUp = () => {
            dragging = false;
            // Remove event listeners when dragging is done
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
        // Attach event listeners for drag behavior
        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }
    redrawRegions(regionLs) {
        const ctx = this._canvas;
        // clear the main canvas context
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        for (const region of regionLs) {
            // we don't modify canvas' position, just regions in menu bar
            if (region.name === "canvas") {
                continue;
            }
            // draw the region
            if (region._imageLoc) {
                const img = new Image();
                img.src = region._imageLoc;
                img.onload = () => {
                    ctx.drawImage(img, region._x, region._y, region._w, region._h);
                };
            }
        }
        ctx.drawImage(this._bufferCanvas, 0, 0);
    }
    get canvas() { return this._canvas; }
    set canvas(v) {
        if (!(this._canvas === v)) {
            this._canvas = v;
        }
    }
    get setted() { return this._setted; }
    set setted(v) {
        if (!(this._setted === v)) {
            this._setted = v;
        }
    }
    get tool() { return this.tool; }
    set tool(v) {
        if (!(this._tool === v)) {
            this._tool = v;
        }
    }
    get x() { return this._x; }
    set x(v) {
        // **** YOUR CODE HERE ****
        // if x changes, update value and redraw
        if (!(this._x === v)) {
            this._x = v;
            this.damage();
        }
    }
    get y() { return this._y; }
    set y(v) {
        // **** YOUR CODE HERE ****
        // if y changes, update value and redraw
        if (!(this._y === v)) {
            this._y = v;
            this.damage();
        }
    }
    get w() { return this._w; }
    set w(v) {
        // **** YOUR CODE HERE ****
        // if w changes, update value and redraw
        if (!(this._w === v)) {
            this._w = v;
            this.damage();
        }
    }
    get h() { return this._h; }
    set h(v) {
        // **** YOUR CODE HERE ****
        // if h changes, update value and redraw
        if (!(this._h === v)) {
            this._h = v;
            this.damage();
        }
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 
    // Size of this object considered as one value
    get size() {
        return { w: this.w, h: this.h };
    }
    set size(v) {
        if ((v.w !== this._w) || (v.h !== this._h)) {
            this._w = v.w;
            this._h = v.h;
            this.damage();
        }
    }
    get name() { return this._name; }
    get parent() { return this._parent; }
    set parent(v) {
        // **** YOUR CODE HERE ****
        // if parent changes, update value and redraw
        if (!(this._parent === v)) {
            this._parent = v;
            this.damage();
        }
    }
    get imageLoc() { return this._imageLoc; }
    set imageLoc(v) {
        if (v !== this._imageLoc) {
            this._imageLoc = v;
            this._startImageLoad();
        }
    }
    get loaded() { return this._loaded; }
    get loadError() { return this._loadError; }
    get resizedByImage() { return this._resizedByImage; }
    // Internal method to resize this region based on its current image.  If this 
    // region is not set to be resized by its image, or the image is not loaded,
    // this does nothing.
    _resizeFromImage() {
        if (this.resizedByImage && this._loaded && this.image) {
            this.size = { w: this.image.width, h: this.image.height };
        }
    }
    get image() { return this._image; }
    //-------------------------------------------------------------------
    // Methods
    //-------------------------------------------------------------------
    // Perform a pick test indicating whether the given position (expressed in the local
    // coordinates of this object) should be considered "inside" or "over" this region.
    pick(localX, localY) {
        // **** YOUR CODE HERE ****
        // localX, localY already translated to region coordinate in FSMInteractors
        // check if the cursor is in the w, h boundary
        return (0 <= localX) && (localX <= this.w) && (0 <= localY) && (localY <= this.h);
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    // Draw the image for this region using the givn drawing context.  The context 
    // should be set up in the local coordinate system of the region (so 0,0 appears
    // at this.x, this.y in the parent canvas).  If the image to be drawn is empty or
    // not yet loaded, or had an error loading, then drawing of the image will not
    // be attempted.  If the showDebugFrame parameter is passed true, a frame is drawn
    // around the (input) bounds of the region for debugging purposes.
    draw(ctx, showDebugFrame = false) {
        // if we have a valid loaded image, draw it
        if (this.loaded && !this.loadError && this.image) {
            // **** YOUR CODE HERE ****
            // Draw the image for this region using the givn drawing context. 
            ctx.drawImage(this.image, 0, 0, this.w, this.h);
        }
        //draw a frame indicating the (input) bounding box if requested
        // if ((showDebugFrame) && (this.name === "canvas")) {
        //     ctx.save();
        //         ctx.strokeStyle = 'black';
        //         ctx.strokeRect(0, 0, window.innerWidth, window.innerHeight);
        //     ctx.restore();
        // }
    }
    startDraw(type) {
        const ctx = this.canvas;
        if (this.setted === false) {
            this._setupCanvasEventHandlers(type);
        }
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    // Declare that something about this region which could affect its drawn appearance
    // has changed (e.g., the image or position has changed).  This passes this image
    // notification to its parent FSM which eventually results in a redraw.
    damage() {
        // **** YOUR CODE HERE ****
        if (this.parent) {
            // Notify parent to redraw
            this.parent.damage();
        }
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    // Asynchronous method to start loading of the image for this region.  This 
    // assumes the _imageLoc property is set up with the location of the image to load 
    // and that the object is otherwise initialized.  It will start the process of loading 
    // the desired image and then immediately return, having set up follow-on actions 
    // to complete the bookkeeping for loading process and decare damage, once the image
    // has actually been loaded.  Entities which wish to draw with the image should 
    // check the loaded property of the region.  If that is false, the image drawing 
    // should be skipped.  Once the image has actually been loaded, that property will
    // be reset and damage will be declared to cause a redraw.  Similarly, the loadError
    // property should be checked.  If a loaded image has loadError true, then the image
    // was unable to be loaded from the designated source.  In that case the it is likely 
    // that drawing code should substitute some type of "broken" indicator.  Note that 
    // images are cached based on their imageLoc string so multiple calls to this method
    // requesting an image from the same location will only result in one remote load
    // request.  Cached images will be available immediately upon return from this method.
    // However, images which fail to load will be marked as such in the cache and will 
    // never subsequently load.  
    _startImageLoad() {
        return __awaiter(this, void 0, void 0, function* () {
            // handle empty image case
            if (this.imageLoc === "") {
                this._image = undefined;
                this._loaded = true;
                this._loadError = false;
                this._resizeFromImage();
                this.damage();
                return;
            }
            // try to get the image from the cache
            if (Region._imageIsCached(this.imageLoc)) {
                this._image = Region._imageFromCache(this.imageLoc);
                this._loaded = true;
                this._loadError = false;
                this._resizeFromImage();
                this.damage();
                return;
            }
            // create a new image object and try to load it
            this._image = new Image();
            if (this._image) {
                const img = this._image;
                this._loaded = false;
                this._loadError = false;
                yield new Promise((resolve, reject) => {
                    // set load callbacks
                    img.onload = () => {
                        resolve(this._image);
                        this._loaded = true;
                        this._resizeFromImage();
                    };
                    img.onerror = () => {
                        reject(this._image);
                        this._loadError = true;
                        this._loaded = true;
                        Err.emit(`Load of image from ${this.imageLoc} failed`);
                    };
                    // loading process is started by assigning to img.src
                    img.src = this._imageLoc;
                });
            }
            // once we are finally loaded (or failed), cache the image
            Region._cacheImage(this.imageLoc, this.loadError ? undefined : this.image);
            // pass damage up to cause a redraw with the new image
            this.damage();
        });
    }
    // Indicate if the given image (represented by its location) is in the cache
    static _imageIsCached(imageLoc) {
        return Region._imageCache.has(imageLoc);
    }
    // Retrieve an image from the cache, or return undefined if the image is not 
    // cached.
    static _imageFromCache(imageLoc) {
        return Region._imageCache.get(imageLoc);
    }
    // Put an image in the cache keyed by its location
    static _cacheImage(imageLoc, img) {
        Region._imageCache.set(imageLoc, img);
    }
    //-------------------------------------------------------------------
    // Debugging Support
    //-------------------------------------------------------------------
    // Create a short human readable string representing this object for debugging
    debugTag() {
        return `Region(${this.name})`;
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    // Create a human readable string displaying this object for debugging purposes
    debugString(indent = 0) {
        let result = "";
        const indentStr = '  '; // two spaces per indent level
        // produce the indent
        for (let i = 0; i < indent; i++)
            result += indentStr;
        result += `Region(${this.name} (${this.x},${this.y},${this.w},${this.h}) `;
        result += `"${this.imageLoc}"`;
        if (this.loaded)
            result += " loaded";
        if (this.loadError)
            result += " err";
        if (!this.parent)
            result += " no parent";
        if (!this.image)
            result += " no image";
        result += ")";
        return result;
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    // Log a human readable string for this object to the console
    dump() {
        console.log(this.debugString());
    }
} // end class Region
//-------------------------------------------------------------------
// (Static) Image cache methods
//-------------------------------------------------------------------
// Map used to cache images across all regions of all FSMs 
Region._imageCache = new Map;
//===================================================================
//# sourceMappingURL=Region.js.map
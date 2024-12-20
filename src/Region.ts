import { FSMInteractor } from "./FSMInteractor.js";
import { Root } from "./Root.js";
import { FSM } from "./FSM.js";
import { Err } from "./Err.js";
import { Check } from "./Check.js";

//===================================================================
// Class for implementing region objects.  Region objects have a name, a bounding box
// (x,y position and size), and an optional image (initially represented by
// a string indicating where it will be loaded from).  Region objects which are 
// initially created with a missing or -1 size will have their size dynamically set
// to match the size of their image.  Objects with a declared size will be independent 
// of their images.  Region objects implement drawing of their image (if any) at the 
// location of the region within the coordinate system of their parent (FSMInteractor) 
// object.  Specifically, region images are drawn with their top-left corner at 0,0 in 
// the local (region object) coordinate system.  However, region image drawing is NOT 
// clipped to the bounds of the region.  The size of the region (and resulting bounding 
// box) is only used for input purposes.  In particular, Region objects implement a pick 
// test which returns true if an input position falls within its bounding box.  
//
// Images for regions are loaded asynchronously (normally from remote resources).  This 
// is done via the _startImageLoad() method.  Load completion is signalled by declaration 
// of damage to the parent FSM, which will eventually result in the display being redrawn 
// to incorporate the newly loaded image.  Note that images are cached, so multiple calls 
// to _startImageLoad() for the same image will not result in multiple remote loads.
//===================================================================
 
// Simple type with basic data for a region that we expect to be supplied by (part of) 
// a .json file.
export type Region_json = {
    name    : string, 
    x       : number, 
    y       : number, 
    w       : number, 
    h       : number, 
    imageLoc: string };

//. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

export class Region {
    // Off-screen buffer for saving previous drawings
    private _bufferCanvas: HTMLCanvasElement; 
    private _bufferContext: CanvasRenderingContext2D; 
    
    // check if we are drawing or not (determine if mouse move should trigger draw)
    private _drawingLine: boolean = false;
    // record previous cursor location (where the current stroke start)
    private _cursorX: number = -1;
    private _cursorY: number = -1;

    public constructor (
		name      : string = "", 
		imageLoc  : string = "",
		x         : number = 0, 
		y         : number = 0,
		w         : number = -1, // -1 here implies we resize based on image
		h         : number = -1, // -1 here implies we resize base on image) 
        canvas   : CanvasRenderingContext2D,
        parent?   : FSM
        ) 
	{
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
        this._onMouseMoveBound = (evt) =>null;
        this._onMouseUpBound = (evt) => null;

        // initialize buffer canvas
        this._bufferCanvas = document.createElement("canvas");
        this._bufferCanvas.width = canvas.canvas.width;
        this._bufferCanvas.height = canvas.canvas.height;
        this._bufferContext = this._bufferCanvas.getContext("2d") as CanvasRenderingContext2D;
        
        // if either of the sizes is -1, we set to resize based on the image
        this._resizedByImage = ((w < 0) || (h < 0));

        // -1 size defaults to 0 (but replaced on load)
        w = (w < 0) ? 0 : w;   
        h = (h < 0) ? 0 : h;   

        this._x = x;   this._y = y; 
        this._w = w;   this._h = h;

        // start the image loading;  this.damage() will be called asynchonously 
        // when that is complete
		this._loaded = false;
        this._loadError = false;
		this._startImageLoad();
	}

    // Construct a Region from a Region_json object, checking all the parts (since data 
    // coming from json parsing lives in javascript land and may not actually be typed
    // at runtime as we think/hope it is).
    public static fromJson(reg : Region_json, canvas:CanvasRenderingContext2D, parent? : FSM) : Region {
        const name : string = reg.name;
    
        const x = Check.numberVal(reg.x??0, "Region.fromJson{x:}");    
        const y = Check.numberVal(reg.y??0, "Region.fromJson{y:}");    
        const w = Check.numberVal(reg.w??-1, "Region.fromJson{w:}");    
        const h = Check.numberVal(reg.h??-1, "Region.fromJson{h:}");    
        const imageLoc = Check.stringVal(reg.imageLoc??"", "Region.fromJson{imageLoc:}");    
        
        return new Region(name, imageLoc, x,y, w,h, canvas, parent);
    }

    // declare listener type
    private _onMouseDownBound: (evt: MouseEvent) => void;
    private _onMouseMoveBound: (evt: MouseEvent) => void;
    private _onMouseUpBound: (evt: MouseEvent) => void;
    
    // set up listeners and initialize when select a new brush
    private _setupCanvasEventHandlers(tool: string) {
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
    public removeListeners() {
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

    
    private _onMouseDown(evt: MouseEvent, tool:string) {
        console.log("mouse down:", tool,evt.offsetX, evt.offsetY)
        // indicate we are currently drawing a line
        this._drawingLine = true;
        // set the start point of current stroke
        this._cursorX = evt.offsetX;
        this._cursorY = evt.offsetY;
    }

    private _onMouseMove(evt: MouseEvent,tool:string) {
        console.log("mouse move:", evt.offsetX, evt.offsetY)
        // sometimes the mouse down is not detected for the first press on canvas right after select brush, 
        // as it is  used to indicate drawing start and set the listeners. 
        // If so, we need to update when it sense the first move
        if(this._cursorX === -1){
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
            if((tool === 'erase') || (tool === 'free')){
                // if it's erasing/free drawing, we directly update on buffer canvas, don't remove adjustions
                this.drawTools(this._bufferContext, evt);
            }else{
                // do the current stroke on ctx
                this.drawTools(ctx, evt)
            }
        }
    }

    private _onMouseUp(evt:MouseEvent) {
        console.log("mouse up:", evt.offsetX, evt.offsetY)              
        // indicate finished a stroke
        this._drawingLine = false;
        // Save final stroke to buffer canvas
        this.drawTools(this._bufferContext, evt); 
    }

    // handle the drawing according to current tool
    private drawTools(ctx:CanvasRenderingContext2D, evt:MouseEvent){
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
                if (w < 0) w = 0-w;
                if (h < 0) h = 0-h;
                ctx.ellipse(this._cursorX, this._cursorY, w, h,Math.PI / 4, 0, 2 * Math.PI)
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

// right click menu, initialize with default
private currentStrokeSize: number = 1; 
private currentColor: string = '#000000'; 

// show color wheel and stroke size adjustion menu
public showColorWheel(evt: MouseEvent | undefined) {
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
    } else {
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
    sizeLabel.style.color = "white"
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
    const outsideClickListener = (event: MouseEvent) => {
        // if click on the selectable targets, discard
        if (!container.contains(event.target as Node)) {
            container.remove();
            // Cleanup event listener
            document.removeEventListener('click', outsideClickListener); 
        }
    };

    // add listener to the canvas
    document.addEventListener('click', outsideClickListener);
}

// when press on moving icon, we can move the menu
public moveMenu(regionLs: Region[]) {
    // store the start place of movement
    let startX: number = 0;
    let startY: number = 0;
    // indicate if we are dragging the menu
    let dragging = false;
    // store the initial positions of regions
    const initialPositions: { region: Region; x: number; y: number }[] = [];
    // if the target we are dragging is an interactive element, then we are not moving the menu
    const isInteractiveElement = (target: EventTarget | null): boolean => {
        if (!target || !(target instanceof HTMLElement)) return false;
        return (target.tagName === "INPUT" );
    };
    // Mouse down: Start tracking the drag
    const onMouseDown = (evt: MouseEvent) => {
        // Ignore the event if it starts on an interactive element
        if (isInteractiveElement(evt.target)) return;
        dragging = true;
        // record the start place
        startX = evt.clientX;
        startY = evt.clientY;
        // Record the initial positions of all regions
        initialPositions.length = 0;
        for (const region of regionLs) {
            // we don't modify canvas' position, just regions in menu bar
            if(region.name === "canvas"){
                continue;
            }
            // for each region, record its initial x and y
            initialPositions.push({ region, x: region._x, y: region._y });
        }
        // Prevent unintended browser behavior
        evt.preventDefault();
    };
    // Mouse move: Update the positions of the regions
    const onMouseMove = (evt: MouseEvent) => {
        if (!dragging) return;
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

private redrawRegions(regionLs: Region[]) {
    const ctx = this._canvas; 
    // clear the main canvas context
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const region of regionLs) {
        // we don't modify canvas' position, just regions in menu bar
        if(region.name === "canvas"){
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






     
    //-------------------------------------------------------------------
    // Properties 
    //-------------------------------------------------------------------

    protected _canvas : CanvasRenderingContext2D;
    public get canvas() {return this._canvas;}
    public set canvas(v : CanvasRenderingContext2D) {
        if (!(this._canvas === v)){
            this._canvas = v;
        }
    }

    protected _setted : boolean;
    public get setted() {return this._setted;}
    public set setted(v : boolean) {
        if (!(this._setted === v)){
            this._setted = v;
        }
    }

    protected _tool : string;
    public get tool() {return this.tool;}
    public set tool(v : string) {
        if (!(this._tool === v)){
            this._tool = v;
        }
    }

    // X position of this object in our parent's coordinate system
	protected _x : number;
    public get x() {return this._x;}
    public set x(v : number) {
            
        // **** YOUR CODE HERE ****
        // if x changes, update value and redraw
        if (!(this._x === v)){
            this._x = v;
            this.damage();
        }
    }
       
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 

    // Y position of this object in our parent's coordinate system
	protected _y : number;
    public get y() {return this._y;}
    public set y(v : number) {
            
        // **** YOUR CODE HERE ****
        // if y changes, update value and redraw
        if (!(this._y === v)){
            this._y = v;
            this.damage();
        }
    }   

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 

    // Width of the input region.  Note that changing this to -1 afer initialization
    // does not cause the size of this object to begin following the size of its image.
	protected _w : number;
    public get w() {return this._w;}
    public set w(v : number) {
            
        // **** YOUR CODE HERE ****
        // if w changes, update value and redraw
        if (!(this._w === v)){
            this._w = v;
            this.damage();
        }
    }  

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 

    // Height of the input region.  Note that changing this to -1 afer initialization
    // does not cause the size of this object to begin following the size of its image.
	protected _h : number;
    public get h() {return this._h;}
    public set h(v : number) {
            
        // **** YOUR CODE HERE ****
        // if h changes, update value and redraw
        if (!(this._h === v)){
            this._h = v;
            this.damage();
        }
    }  

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 

    // Size of this object considered as one value
    public get size() : {w:number, h:number} {
        return {w:this.w, h:this.h};
    }

    public set size(v : {w:number, h:number}) {
        if ((v.w !== this._w) || (v.h !== this._h)) {
            this._w = v.w;
            this._h = v.h;
            this.damage();
        }
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // Name of this region.  
    protected _name : string;
    public get name() {return this._name;}

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // link to parent (FSM) of this object
    protected _parent : FSM | undefined;
    public get parent() {return this._parent;}
    public set parent(v : FSM | undefined) {
            
        // **** YOUR CODE HERE ****
        // if parent changes, update value and redraw
        if (!(this._parent === v)){
            this._parent = v;
            this.damage();
        }
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // The location the image of this object should be loaded from.  For example:
    // "./images/my_image.png" would indicate a .png file in the "image" directory
    // inside the directory that the hosting web page was loaded from.  This should
    // be set to "" to indicate that no image is to be drawn.  As soon as (and whenever)
    // this value is set, an asynchronous image load will be started (although images 
    // are cached, and may be drawn from there immediately if the image location has 
    // been loaded from before).  
	protected _imageLoc : string;
    public get imageLoc() {return this._imageLoc;}
    public set imageLoc(v : string) {
        if (v !== this._imageLoc) {
            this._imageLoc = v;
            this._startImageLoad();
        }
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // Indication of whether the image for this region has been loaded
	protected _loaded : boolean;
    public get loaded() {return this._loaded;}

    // Indication of whether the load of the image for this region failed.  Regions
    // with failed image loads will have both loaded and loadError true.
    protected _loadError : boolean;
    public get loadError() {return this._loadError;}
    
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // Is this region dynamically resized to match the image currently displayed in it.
    // This can be requested at initializatin of the region by using a missing or -1 
    // size (but can't be changed later).
	protected _resizedByImage : boolean;
    public get resizedByImage() {return this._resizedByImage;}
    
    // Internal method to resize this region based on its current image.  If this 
    // region is not set to be resized by its image, or the image is not loaded,
    // this does nothing.
    protected _resizeFromImage() : void {
        if (this.resizedByImage && this._loaded && this.image) {
            this.size = {w:this.image.width, h:this.image.height};
        }
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // Reference to the HTML image object for our image (if any).
	protected _image : HTMLImageElement | undefined;
    public get image() {return this._image;}

    //-------------------------------------------------------------------
    // Methods
    //-------------------------------------------------------------------
  
    // Perform a pick test indicating whether the given position (expressed in the local
    // coordinates of this object) should be considered "inside" or "over" this region.
    public pick(localX : number, localY : number) : boolean {
            
        // **** YOUR CODE HERE ****
        // localX, localY already translated to region coordinate in FSMInteractors
        // check if the cursor is in the w, h boundary
        return (0<=localX ) && (localX <= this.w) && (0<=localY)&&(localY <= this.h)
        
        
        
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // Draw the image for this region using the givn drawing context.  The context 
    // should be set up in the local coordinate system of the region (so 0,0 appears
    // at this.x, this.y in the parent canvas).  If the image to be drawn is empty or
    // not yet loaded, or had an error loading, then drawing of the image will not
    // be attempted.  If the showDebugFrame parameter is passed true, a frame is drawn
    // around the (input) bounds of the region for debugging purposes.
    public draw(ctx : CanvasRenderingContext2D, showDebugFrame : boolean = false) : void {
        // if we have a valid loaded image, draw it
        if (this.loaded && !this.loadError && this.image) {
               
            // **** YOUR CODE HERE ****
            
            
            // Draw the image for this region using the givn drawing context. 
            ctx.drawImage(this.image, 0,0, this.w, this.h);
            

        }
        
        //draw a frame indicating the (input) bounding box if requested
        // if ((showDebugFrame) && (this.name === "canvas")) {
        //     ctx.save();
        //         ctx.strokeStyle = 'black';
                
        //         ctx.strokeRect(0, 0, window.innerWidth, window.innerHeight);
        //     ctx.restore();
        // }
    }

    public startDraw(type: string){
        
        const ctx = this.canvas;
        if(this.setted === false){
            this._setupCanvasEventHandlers(type);
        }
        
    }
    
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

    // Declare that something about this region which could affect its drawn appearance
    // has changed (e.g., the image or position has changed).  This passes this image
    // notification to its parent FSM which eventually results in a redraw.
    public damage() {
            
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
    protected async _startImageLoad() {
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

            await new Promise((resolve,reject) => {
                // set load callbacks
                img.onload = () => {
                    resolve(this._image);
                    this._loaded = true;
                    this._resizeFromImage();
                }
                img.onerror = () => {
                    reject(this._image);
                    this._loadError = true;
                    this._loaded = true;
                    Err.emit(`Load of image from ${this.imageLoc} failed`)
                } 
                
                // loading process is started by assigning to img.src
                img.src = this._imageLoc;
            });
        } 
        // once we are finally loaded (or failed), cache the image
        Region._cacheImage(this.imageLoc, this.loadError ? undefined : this.image);

        // pass damage up to cause a redraw with the new image
        this.damage();
    }
   
    //-------------------------------------------------------------------
    // (Static) Image cache methods
    //-------------------------------------------------------------------

    // Map used to cache images across all regions of all FSMs 
    protected static _imageCache = new Map<string, HTMLImageElement | undefined>;

    // Indicate if the given image (represented by its location) is in the cache
    protected static _imageIsCached(imageLoc : string) : boolean {
        return Region._imageCache.has(imageLoc);
    }

    // Retrieve an image from the cache, or return undefined if the image is not 
    // cached.
    protected static _imageFromCache(imageLoc : string) : HTMLImageElement | undefined {
        return Region._imageCache.get(imageLoc);
    }

    // Put an image in the cache keyed by its location
    protected static _cacheImage(imageLoc : string, img : HTMLImageElement | undefined) {
        Region._imageCache.set(imageLoc, img);
    }
     
    //-------------------------------------------------------------------
    // Debugging Support
    //-------------------------------------------------------------------

    // Create a short human readable string representing this object for debugging
    public debugTag() : string {
        return `Region(${this.name})`;
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    // Create a human readable string displaying this object for debugging purposes
    public debugString(indent : number = 0) : string {
        let result = "";
        const indentStr = '  ';  // two spaces per indent level

        // produce the indent
        for (let i = 0; i < indent; i++) result += indentStr;

        result += `Region(${this.name} (${this.x},${this.y},${this.w},${this.h}) `;
        result += `"${this.imageLoc}"`;
        if (this.loaded) result += " loaded";
        if (this.loadError) result += " err";
        if (!this.parent) result += " no parent";
        if (!this.image) result += " no image";
        result += ")";
        
        return result;
    }
    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    
    // Log a human readable string for this object to the console
    public dump() {
        console.log(this.debugString());
    }

    //. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .

} // end class Region

//===================================================================
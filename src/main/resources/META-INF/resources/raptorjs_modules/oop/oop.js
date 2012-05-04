
var raptorClassDefs = {}; //Class definitionsLookup are global for a reason. It allows the
                          //the class definitions to remain even if a new Raptor environment
                          //which is needed for testing.


raptorBuilder.addLoader(function(raptor) {
    
    var forEach = raptor.forEach, //Short-hand reference to function for iterating over arrays with a function callback
        forEachEntry = raptor.forEachEntry, //Short-hand reference for iterating over object properties
        isArray = raptor.isArray,
        logging = raptor.logging, //Logging module used to add logging support to classes and modules
        logger = logging.logger('oop'), //The logger to use for this module
        FUNCTION = 'function', //String constant
        STRING = 'string', //String constant
        PROTOTYPE = "prototype",
        ENUM_COUNT = "_count",
        FACTORY_IDX = 0,
        TYPE_IDX = 1,
        MODIFIERS_IDX = 2,
        ENUM_VALUES_IDX = 3,
        EXTENSIONS_IDX = 4,
        nameSpaces = {}, //Lookup for global namespaces
        definitionsLookup = raptorClassDefs, //Local variable reference to the global definitions lookup
        loadedLookup = {}, //A lookup for loaded classes/modules/mixins/enums
        oop = null,    //Used to self-refer to this module. Used instead of "this" for minification and in unbound callbacks
        _addTypeInfo = function(obj, name, type) { //Adds hidden type information to created class constructors, class prototypes, modules and enums (not mixins)
                obj.__name = name;
                obj.__type = type;
            },
        _simpleExtend = raptor.extend, //A method to add properties to an object without support for "overridden" or "doNotOverride" properties (faster)
        _extend = function(target, source, overridden, doNotOverride) { //An extend method with additional features
            var overriddenProp;
            
            for (var propName in source) {
                if (source.hasOwnProperty(propName)) { //Only look at source properties that are not inherited
                    if ((overriddenProp = target[propName])) { //See if there is an existing property with the same name in the target object
                        if (doNotOverride === true) { //There is an existing property, if "doNotOverride" is set to true then we shouldn't override it
                            continue; //Skip copying this property
                        }
                        
                        if (overridden) { //If a object was provided to track overridden properties then add the old property to that object
                            overridden[propName] = overriddenProp;
                        }
                    }
                    target[propName] = source[propName]; //Copy the property
                }
            }
        },
        _inherit = function(clazz, superclass, copyProps) { //Helper function to setup the prototype chain of a class to inherit from another class's prototype
            
            var proto = clazz[PROTOTYPE];

            var F = function() {};
              
            F[PROTOTYPE] = typeof superclass === STRING ?    //Is the superclass the name of a super class?
                      raptor.require(superclass)[PROTOTYPE] :  //If it is a string, then look it up and using the prototype of that superclass
                      superclass[PROTOTYPE];
                      
            clazz.superclass = F[PROTOTYPE];

            clazz[PROTOTYPE] = new F();
              
            if (copyProps === true) {
                _simpleExtend(clazz[PROTOTYPE], proto);
            }
              
            return proto;
        },
        _createLoggerFunction = function(name) { //Helper function invoked for each class to add a "logger()" function to the class prototype
            var logger;
            
            return function() {
                if (!logger) {
                    logger = logging.logger(name); //Create the logger with the specified name if it hasn't been created
                }
                return logger;
            };
        },
        _staticToString = function() {
            return '[' + this.__type + ': ' + this.__name + ']';
        },
        _getShortName = function() {
            var shortName,
                name;
            
            if ((shortName = this.__shortName) === undefined) {
                name = this.__name;
                var endStart = name.lastIndexOf('.');
                if (endStart === -1) {
                    endStart = name.lastIndexOf('/');
                }
                
                this.__shortName = shortName = name.substring(endStart+1);
            }
            return shortName;
        },
        _getName = function() {
            return this.__name;
        },
        _instanceToString = function() {
            return '[' + this.__name + ']';
        },
        _instanceGetClass = function() {
            return oop.require(this.__name);
        },
        _create = function(prototype) {
            var Obj = function() {};
            Obj[PROTOTYPE] = prototype;
            return new Obj();
        },
        _construct = function(name,args) {

            var type = raptor.require(name);

            var object = _create(type[PROTOTYPE]);
            object.constructor.apply(object,args);
            return object;

        },
        _enumValueOf = function(name) {
            return this[name];
        },
        _enumValueOrdinal = function() {
            return this._ordinal;
        },
        _enumValueName = function() {
            return this._name;
        },
        _enumValueCompareTo = function(other) {
            return this._ordinal - other._ordinal;
        },
        _addEnumValue = function(target, name, EnumCtor) {
            var enumValue = target[name] = new EnumCtor();
            enumValue._ordinal = target[ENUM_COUNT]++;
            enumValue._name = name;
            return enumValue;
        };

    
    //Constants for each of the "object types"
    var CLASS = 0,      //Supports inheritance. A constructor function is returned
        MODULE = 1,    //All properties treated as statics. An object is returned
        ENUM = 2,        //Supports constant static fields. An object is returned with the enum constants
        MIXIN = 3;      //All properties treated as statics. An object is returned

    var typeNames = ['class', 'module', 'enum', 'mixin']; //Translation type of object types (e.g. CLASS) to type names (e.g. 'class')
   
    raptor.defineCore('oop', {
        /**
         * Defines a Raptor JavaScript class.
         * 
         * Multiple signatures supported:
         * <ul>
         * <li>defineClass(name, modifiers, factory)
         * <li>defineClass(name, superclassName, factory)
         * <li>defineClass(name, factory)
         * <li>defineClass(modifiers, factory)
         * <li>defineClass(factory)
         * </ul>
         * 
         * Supported modifiers:
         * <ul>
         * <li>superclass: The name of the super class
         * </ul>
         * 
         * In addition, the "modifiers" parameter can be a string that specifies the name of the superclass
         *
         * <h2>Examples: Class with prototype</h2>
         * <js>
         * raptor.defineClass(
         *     'some.namespace.MyClass',
         *     function() {
         *         return {
         *             someMethod: function() { ... }
         *         }
         *     });
         * </js>
         * 
         * @param name The name of the class (if not provided then class is built is an anonymous class and immediately returned
         * @param modifiers Optional modifiers (see above)
         * @param factory A factory function that returns either the class constructory function (with prototype)
         *                or just the prototype
         * 
         * @returns {void|class} Returns the class constructor function if the class is anonymous, otherwise nothing is returned
         */
        defineClass: function(name, modifiers, factory) {
            var args = arguments;
            
            if (args.length === 2) { //Most common: defineClass(name, factory)
                factory = modifiers; //Factory is always the second parameter if there are two args
                
                //The first arg is either a class name or a modifiers object
                if (typeof name === STRING) {
                    modifiers = null; //No modifiers
                }
                else {
                    modifiers = name; //The modifiers is the first parameter
                    name = null;
                }
            }
            else if (args.length === 1) {
                factory = name; //The factory is the first argument and there is no name or modifiers
                name = null;
                modifiers = null;
            }
            //If there are three args then that is the default case and no shuffling of args is required
            
            if (typeof modifiers === STRING) {
                //Handle the case where the 'modifiers' is a string that refers to the superclass (equivalent to {superclass: superclassName})
                modifiers = {
                    superclass: modifiers
                };
            }
            
            return oop._define(name, factory, CLASS, modifiers);
        },
        
        /**
         * Defines a Raptor JavaScript module.
         * 
         * <p>
         * Defines a module that can later be loaded using "raptor.require(moduleName)".
         * A module is simply a namespace that can contain properties (including methods, classes and fields).
         * A factory function must be provided so that the module can be created when it
         * is first requested (i.e. it is lazily initialized). The return value of the factory
         * function should be the module definition as a JavaScript object with properties.
         * Once a module has been created for the first time it is stored in a lookup
         * table and returned for all subsequent requests to get access to that module.
         * 
         * <p>
         * It's also possible to have an anonymous module by defining a module
         * without a name and passing the factory function as the first and only
         * argument. If the module is anonymous then the module will be immediately
         * created and returned.
         * 
         * @param {string} name The name of the module
         * @param {function} factory The factory function responsible for creating the module.
         * @returns Nothing is returned if a name is provided. Otherwise, if a name is provided
         *          the newly constructed module is immediately returned.
         */
        defineModule: function(name, factory) {
            return oop._define(name, factory, MODULE);
        },
        
        /**
         * Defines a Raptor JavaScript enum type.
         * 
         * <p>RaptorJS enums provides a way to define constants. Each enum value is an 
         * instance of a JavaScript class that can have a constructor, methods, and properties.
         * 
         * <p>
         * Every enum class supports the following methods.
         * <ul>
         * <li>valueOf(name) - Returns the constant field with the same name (case sensitive)</li>
         * </ul>
         * 
         * Every enum field supports the following methods.
         * <ul>
         * <li>name() - Returns the name of the enum
         * <li>ordinal() - Returns the positional value of the enum (NOTE: This should only be used for an array of enum strings. Order is undefined for maps but it will work correctly in most browsers.)
         * <li>toString() - Returns the name of the enum unless it has been overridden
         * <li>compareTo(other) - Compares one enum field to another based on the ordinal value 
         * </ul>
         * 
         * <h2>Simple enum</h2>
         * <js>
raptor.defineEnum(
    'some.namespace.Day',
    [
        "SUN",
        "MON",
        "TUE",
        "WED",
        "THU",
        "FRI",
        "SAT"
    ]);
         * </js>
         * 
         * <h2>Complex enum with custom constructor, properties and methods</h2>
         * <js>
raptor.defineEnum(
    'some.namespace.Day',
    {
        SUN: [false, "Sunday"],
        MON: [true, "Monday"],
        TUE: [true, "Tuesday"],
        WED: [true, "Wednesday"],
        THU: [true, "Thursday"],
        FRI: [true, "Friday"],
        SAT: [false, "Saturday"]
    },
    function(raptor, type) {
        return {
            init: function(isWeekday, longName) {
                this._isWeekday = isWeekday;
                this._longName = longName;
            },
             
            getLongName: function() {
                return this._longName;
            },
             
            isWeekday: function() {
                return this._isWeekday;
            }
        }
    });
         * </js>
         * 
         * @param name The name of the enum type
         * @param enumValues {Array<String>|Object} Enum values (either an array of strings or an object with enum names as properties and constructor arguments as values) 
         * @param factory The factory function to produce the enum class (optional for simple enums)
         * @returns Nothing is returned if a name is provided. Otherwise, if a name is provided
         *          the newly constructed enum is immediately returned.
         */
        defineEnum: function(name, enumValues, factory) {
            return oop._define(name, factory, ENUM, null, enumValues);
        },
        
        /**
         * Defines a Raptor JavaScript mixin.
         * 
         * @param name
         * @param factory
         * @returns
         */
        defineMixin: function(name, factory) {
            return oop._define(name, factory, MIXIN);
        },
        
        /**
         * 
         * @param name
         * @returns {Boolean}
         */
        isDefined: function(name) {
            return definitionsLookup[name] !== undefined;
        },

        /**
         * 
         * @param name
         * @param factory
         * @param type
         * @param modifiers
         * @param enumValues
         * @returns
         */
        _define: function(name, factory, type, modifiers, enumValues) {

            if (loadedLookup[name] === null) {
                delete loadedLookup[name]; //We now have a definition available
            }
            
            var def = [factory, type, modifiers, enumValues, null /*extensions*/];
            
            if (!name) {
                //If no name is provided then we have to build the class immediately
                //and return it since it is an anonymous class
                return oop._build("(anonymous)", def);
            }

            var existingDef = definitionsLookup[name];
            
            if (!existingDef) {
                definitionsLookup[name] = def;
            }
            else {
                //This would only happen if extensions were loaded before the class itself was defined
                existingDef[FACTORY_IDX] = factory;
                existingDef[TYPE_IDX] = type;
                existingDef[MODIFIERS_IDX] = modifiers;
                existingDef[ENUM_VALUES_IDX] = enumValues;
            }
            
            return def;
        },
        
        /**
         * Attempts to load the object with the specified name. If the object
         * is not found then null is returned.
         * 
         * This method is similar to the require method. The only difference
         * is that the require method will throw an exception if the object
         * with the specified name is not found.
         * 
         * @param name The name of the class/module/mixin/enum
         * @returns Returns an instance of an object if it exists, otherwise null
         */
        find: function(name) {
            return oop.require(name, null, null, true); //Checks for the existing of an object
        },
        

        /**
         * Attempts to load the object with the specified name. If the object
         * is not found then null is returned.
         * 
         * Synonym for "find"
         * 
         * @param name The name of the class/module/mixin/enum
         * @returns Returns an instance of an object if it exists, otherwise null
         */
        load: function(name) {
            return oop.find(name);
        },
        
        /**
         * Obtains reference(s) to the requested class/module/mixin/enum (either synchronously or asynchronously). If the requested objects
         * have not already been initialized then they will be lazily initialized.
         * 
         * <p>When loading modules, this method supports both synchronous module loading and asynchronous module loading.
         * <ul>
         * <li><b>Synchronous module loading:</b> With synchronous module loading, a single module is loaded and immediately returned. The code
         * for the module must be available for synchronous module loading to work. If the requested module name is not found then an Error is thrown
         * unless the ignoreMissing argument is set to true.
         * 
         * <li><b>Asynchronous module loading:</b> If an asynchronous callback is provided
         * as the second parameter then one or more modules can be loaded. The module name(s)
         * can be provided as a single string argument or as an array of string paragments
         * Upon successful
         * completion the "success" back handler will be invoked and the loaded modules
         * will be passed as arguments in the order that they were provided.
         * </ul>
         * 
         * 
         * <h2>Examples:</h2>
         * 
         * <h3>Synchronous module/class/mixin/enum loading</h3>
         * <js>
         * var widgets = raptor.require('widgets');
         * widgets.get(widgetId).destroy();
         * </js>
         * 
         * <h3>Asynchronous module loading (single module)</h3>
         * <js>
         * raptor.require('widgets', function(widgets) {
         *     if (arguments.length == 0) {
         *         //Module loading failed...
         *         return;
         *     }
         *     
         *     widgets.get(widgetId).destroy();
         * });
         * </js>
         * 
         * <h3>Asynchronous module loading (multiple modules)</h3>
         * <js>
         * raptor.require(['widgets', 'json'], function(widgets, json) {
         *     if (arguments.length == 0) {
         *         //Module loading failed...
         *         return;
         *     }
         *     
         *     //Do something with the loaded modules...
         * });
         * </js>
         * 
         * <h3>Asynchronous module loading (multiple event listeners)</h3>
         * <js>
         * raptor.require(['widgets', 'json'], {
         *     success: function(widgets, json) {
         *         //Do something with the loaded modules...
         *     },
         *     error: function() {
         *         //Something went wrong...
         *     }
         * });
         * </js>
         * 
         * <h3>Asynchronous module loading (all event listeners)</h3>
         * <js>
         * raptor.require(['widgets', 'json'], {
         *     success: function(widgets, json) {
         *         //Do something with the loaded modules...
         *     },
         *     error: function() {
         *         //Something went wrong...
         *     },
         *     complete: function(result) {
         *         //Module loading completed
         *         var success = result.success;
         *         //...
         *     },
         *     asyncStart: function() {
         *         //At least modules weren't already loaded and have 
         *         //started to be downloaded asynchronously
         *     },
         *     asyncComplete: function() {
         *         //The asynchronous downloading of the modules has completed
         *     }
         * });
         * </js>
         * 
         * @param name {String|Array<String>} The name of the class/module/mixin/enum
         * @param asyncCallback {Object|Function} A success/error callback function or an object with callback functions for some or all of the the supported events. The following events are supported: asyncStart, success, error, asyncComplete, complete - (<b>NOTE:</b> Should only be used with module loading)
         * @param thisObj {Object} The "this" object for the callback function(s) - (<b>NOTE:</b> Should only be used with module loading)  
         * @param ignoreMissing {Boolean} If true then an Error will not be thrown if the requested object is not found.
         * @returns {Object|loader-Transaction} For synchronous module/class/mixin/enum loading, a reference to the requested class/module/mixin/enum is returned. For asynchronous module loading, the transaction is returned. 
         */
        require: function(name, asyncCallback, thisObj, ignoreMissing) {
            
            if (asyncCallback || isArray(name)) {
                //If an asynchronous callback is provided or if multiple module names are provided then we go through the "loader"
                //module to load the required modules as a single transaction.
                
                var loader = this.find('loader');
                
                if (!loader) {
                    //The "loader" module is an optional module, but is required for asynchronous module loading.
                    raptor.errors.throwError(new Error('The "loader" module is required for asynchronous module loading'));
                }
                
                if (!loader.require) {
                    raptor.errors.throwError(new Error('The "loader.requires" extension is not enabled'));
                }
                
                return loader.require(
                        name, /* handles arrays and single names */
                        asyncCallback,
                        thisObj);
            }
            
            var loaded = loadedLookup[name]; //See if the object has already been loaded
            
            if (loaded !== undefined)
            {
                //If loaded, then just return it
                return loaded;
            }
            
            //Otherwise, try to load the object with the specified name
            loaded = oop._load(name);
            
            //If we didn't find the object then throw an error
            if (loaded === undefined && ignoreMissing !== true) {
                oop.handleMissing(name);
            }
            return loaded;
        },
        
        /**
         * Returns references to multiple objects as properties of an object.
         * 
         * The short name of the requested will be used as the property name in the returned
         * object.
         * 
         * <h2>Example:</h2>
         * <js>
         * var imports = raptor.requireAll('widgets', 'some.namespace.MyClass');
         * var widgets = imports.widgets;
         * var myObject = new imports.MyClass();
         * 
         * </js>
         * 
         * @deprecated This method is experimental and might be removed in the future.
         * 
         * @param names {...String} A variable length argument of object names
         * @returns {object} Object with the short names of the objects as keys and the objects themselves as values
         */
        requireAll: function(names) {
            var i=0,
                args = arguments,
                imports = {},
                len = args.length,
                loaded;
        
            for (; i<len; i++)
            {
                loaded = oop.require(args[i]);
                imports[loaded.getShortName()] = loaded;
            }
            
            return imports;
        },

        /**
         * 
         * @param name
         * @param find
         * @returns
         */
        _load: function(name, find) {
            //See if the definition for the object can be found or if the object has already been loaded
            var def = definitionsLookup[name],
                loaded = loadedLookup[name];
            
            if (raptor.hasOwnProperty(name)) {
                loaded = raptor[name];
            }
            
            if (def && !loaded) {
                //We found a definition, just build the object based on that definition
                loaded = oop._build(name, def);
                loadedLookup[name] = loaded;
            }
            
               
            if (loaded || loaded === null) {
                return loaded;
            }
            
            //Otherwise, try to find
            if (oop.findMissing) {
                if (find !== false) {
                    loaded =  oop.findMissing(name);
                }
            }
            else {
                loaded = null;
            }
            
            if (loaded === null) {
                loadedLookup[name] = loaded = null; //Give up
            }
            
            return loaded;
        },

        /**
         * 
         * @param name
         * @param def
         * @returns
         */
        _build: function(name, def)
        {
            var type,           //The object with the user defined methods and properties
                clazz,          //The resulting object that is constructed and returned
                proto,          //The prototype for the class (CLASS and ENUM types only)
                targetType = def[TYPE_IDX],             //The output type (either CLASS, MODULE, ENUM or MIXIN)
                targetTypeName = typeNames[targetType], //The name of the output type (either 'class', 'module', 'enum' or 'mixin')
                modifiers = def[MODIFIERS_IDX] || {},   //Modifiers for the object being defined
                superClassName,
                onlyStatics = targetType === MODULE || targetType === MIXIN, //If true, then an object with static methods will be returned and not a constructor function
                mixinsTarget,   //The object to apply mixins to (either a prototype or the output object itself)
                extensions,     //The extensions that were found for the class
                mixins,         //The list of mixins to apply to the class after it is loaded
                factory = def[FACTORY_IDX],        //The factory function for the definition (invoked to get the type definition)
                enumValues = def[ENUM_VALUES_IDX],
                isEnum = targetType === ENUM,
                EnumCtor,
                enumValue;

            if (factory) {
                //The factory can be a function or just the type.
                if (typeof factory === FUNCTION) {
                    //If it is a function then execute the function to produce the type
                    type = factory(raptor);
                }
                else {
                    //Otherwise, use it is as the type directly
                    type = factory;
                }
            }
            else if (isEnum) {
                type = function() {}; //Enum values were provided, but a constructor function is not required
            }
            else {
                raptor.errors.throwError(new Error('Invalid definition for "' + name + '"'));
            }

            //If the object define consists of only statics then we don't need to mess with prototypes or inheritance
            //and the output simply becomes the input type with modifications applied (e.g. mixins)
            if (onlyStatics) {
                clazz = mixinsTarget = type;
            }
            else {
                /*
                 * We have a "type" object which contains the methods and constructors. We now
                 * need to initialize a JavaScript "class" with the correct constructor function
                 * and the correct prototype
                 */
                if (typeof type === FUNCTION) {
                    clazz = type;
                }
                else {
                    clazz = type.init || function() {};
                    clazz[PROTOTYPE] = type;
                }

                if ((superClassName = modifiers.superclass))
                {
                    _inherit(clazz, superClassName, true);
                }
                
                proto = clazz[PROTOTYPE];

                _addTypeInfo(proto, name, targetTypeName);      //Add hidden fields to the prototype for the class so we can reflect on it
                if (proto.toString === Object[PROTOTYPE].toString) {   //Add a default toString method if it doesn't already have one
                    proto.toString = isEnum ? _enumValueName : _instanceToString;
                }
                proto.getClass = _instanceGetClass;  //Add the ability to lookup the class for an instance of a class
                proto.init = proto.constructor = clazz;   //Add init/constructor properties for convenience
                mixinsTarget = proto;                       //Add all mixins to the prototype of the class
            }
            
            if (targetType !== MIXIN) {
                _addTypeInfo(clazz, name, targetTypeName);          //Add type info to the resulting object
                clazz.getName = _getName;                //Helper method to return the name of the class/module/enum/mixin
                clazz.getShortName = _getShortName;
                clazz.toString = _staticToString;
                mixinsTarget.logger = _createLoggerFunction(name);
            }

            //Handle extensions
            if ((extensions = def[EXTENSIONS_IDX]))
            {
                forEach(extensions, function(ext) {
                    oop.extend(mixinsTarget, ext.source);
                }, this);
            }
            
            //Check to see if this class explicitly wants any mixins to be applied
            if ((mixins = modifiers.mixins)) {
                forEach(mixins, function(mixin) {
                    oop.extend(mixinsTarget, mixin);
                }, oop);
            }
            
            if (isEnum) {
                clazz[ENUM_COUNT] = 0;
                
                if (isArray(enumValues)) 
                {
                    forEach(enumValues, function(name) {
                        _addEnumValue(clazz, name, clazz);
                    });
                }
                else if (enumValues) {
                    EnumCtor = function() {};
                    EnumCtor[PROTOTYPE] = proto;
                    
                    forEachEntry(enumValues, function(name, args) {
                        enumValue = _addEnumValue(clazz, name, EnumCtor);
                        clazz.apply(enumValue, args || []);
                    });
                }
                clazz.valueOf = _enumValueOf;
                proto.name = _enumValueName;
                proto.ordinal = _enumValueOrdinal;
                proto.compareTo = _enumValueCompareTo;
            }
            
            if (clazz.__init) {
                clazz.__init();
            }
            

            return clazz;
            
        },
        
        /**
         * Adds mixins from the specified source to the specified target.
         * 
         * @param target {String|Class|Object} The target for the source mixins. If the target is a string then it is looked up using raptor.require(target). If the target is a class then the source mixins are applied to the prototype. If the target is an object then the source mixins are directly added to the object
         * @param source {String|Object|Function} The source mixins for the target. If the source is a string then it is looked up using raptor.require(source). If the source is an object then the properties of the source object are used as the mixins. If the source is a function then the function is executed and the returned object is used as the source.
         * @param doNotOverride {Boolean} If true then properties that already exist in the target will not be overridden from the source
         * @param overridden {Object} If provided, this object will be populated with properties that were overridden. The keys will be the names of the overridden properties and the values will be the previous value of the corresponding name.
         * @returns {void}
         */
        extend: function(target, source, doNotOverride, overridden) {

            if (!source) return; //If source is null then there is nothing to extend the target with
            
            if (typeof target === STRING) {
                
                //Always register the extensions with the definition so that if the object
                //needs to be reloaded the extensions will again be reapplied
                var def = definitionsLookup[target];
                if (!def) {
                    def = oop._define(target, null, null);
                }
                /**
                 * @class
                 * @name oop-RaptorExtensionDefinition
                 * @private
                 */
                var ext = {
                        /**
                         * The source of the mixins to apply to the target
                         */
                        source: source
                };

                var extensions = def[EXTENSIONS_IDX];
                if (!extensions) {
                    def[EXTENSIONS_IDX] = [ext];
                }
                else {
                    extensions.push(ext);
                }
                
                //If the target object is a string then we need to see if it has been loaded
                var loaded = loadedLookup[target]; //See if the object has already been loaded
                if (loaded) {
                    //If the target object has already been loaded then we can used the loaded object as the target
                    if (typeof loaded === FUNCTION) { //The loaded object is a class... mixins should apply to the prototype
                        target = loaded[PROTOTYPE];
                    }
                    else {
                        target = loaded; //The loaded object is either a module, enum or mixin
                    }
                }
                else
                {
                    //The target object has *not* been loaded. Instead of loading the target to apply
                    //the mixins we'll do nothing since the extensions have already been registered with
                    //the object definition and will be applied when the object is loaded for the first time
                    return; 
                }
            }
            
            if (typeof source === FUNCTION) {
                //If the source is a function then treat it as a factory function
                //that will return the mixins
                if (!overridden) {
                    overridden = {}; //Allows the source to know which properties it has overridden in the target object and to refer to them
                }
                source = source(raptor, target, overridden); //Execute the factory function with three parameters
            }
            else if (typeof source === STRING)
            {
                //The source is the name of the source so load the source
                source = oop.require(source);
            }
            
            var createMixin = source.createMixin || source.extend;
            
            if (createMixin) {
                if (!overridden) {
                    overridden = {};
                }

                source = createMixin.call(source, target, overridden);
            }
            
            if (doNotOverride || overridden) {
                _extend(target, source, overridden, doNotOverride);
            }
            else {
                return _simpleExtend(target, source);
            }
        },
        
        /**
         * Sets up the prototype chain so that one prototype inherits from another
         * 
         * @function
         * @param {function} clazz The subclass constructor function
         * @param {function|string} superclass The superclass constructor function or the name of the superclass
         * @param {Boolean} copyProps If true, then the newly constructed prototype for the sub class will be populated with the original properties. (optional, defaults to false)
         * 
         *  @return {void}
         */
        inherit: _inherit,
        
        handleMissing: function(name) {
            throw new Error('require failed. "' + name + '" not found.');
        }
    });
    
    oop = raptor.oop;
    
    forEach(
            ['require',
             'requireAll',
             'find',
             'load',
             'defineClass',
             'defineEnum',
             'defineModule',
             'defineMixin',
             'extend',
             'inherit'],
            function(methodName) {
                raptor[methodName] = oop[methodName];
            });

});
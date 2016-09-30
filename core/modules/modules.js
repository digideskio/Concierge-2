/**
 * Provides methods for handling user modules.
 *
 * Written By:
 * 		Matthew Knox
 *
 * License:
 *		MIT License. All code unless otherwise specified is
 *		Copyright (c) Matthew Knox and Contributors 2016.
 */

const EventEmitter = require('events'),
    path = require('path'),
    files = require.once(rootPathJoin('core/files.js'));

class ModuleLoader extends EventEmitter {
    constructor() {
        super();
        this.loaders = [require.once('./kassyModule.js'), require.once('./hubotModule.js')];
        this.loadedModules = [];
        //this.on('load', (mod) => {
        //    console.info(console.isDebug() ? $$`Loading Succeeded` : $$`[DONE]`);
        //});

        //this.on('unload', (name) => {
        //    console.debug($$`Unloading module "${name}".`);
        //});
    }

    _listModules (callback) {
        let data = files.filesInDirectory(global.__modulesPath),
            asyncCounter = 0,
            asyncLoader = (name, candidate, index) => {
                let output = null;
                try {
                    output = this.verifyModule(candidate);
                    if (!output) {
                        throw null;
                    }
                    data[index] = output.name;
                }
                catch (e) {
                    //console.debug($$`A failure occured while listing "${name}". It doesn't appear to be a module.`);
                    if (e) {
                        console.critical(e);
                    }
                }
                callback(output, ++asyncCounter === data.length);
            };

        this.emit('loading', data);
        for (let i = 0; i < data.length; i++) {
            const candidate = path.resolve(path.join(global.__modulesPath, data[i]));
            process.nextTick(asyncLoader.bind(null, data[i], candidate, i));
        }
    }

    _loadModuleInternal (module, platform, callback) {
        process.nextTick(() => {
            let res;
            try {
                //console.write($$`Loading module '${module.name}'... ${(console.isDebug() ? '\n': '\t')}`);
                const m = this.loaders[module.__loaderUID].loadModule(module, platform.config);
                m.__loaderPriority = module.priority;
                m.__version = module.version;
                if (module.folderPath) {
                    m.__folderPath = module.folderPath;
                }
                m.platform = platform;
                res = m;
                this._insertSorted(res);
            }
            catch (e) {
                //console.error(console.isDebug() ? $$`Loading Failed` : $$`[FAIL]`);
                console.critical(e);
                //console.debug($$`Module "${module.name}" could not be loaded.`);
                res = null;
            }
            callback(res);
        });
    }

    _insertSorted (module) {
        if (this.loadedModules.length === 0) {
            this.loadedModules.push(module);
            return;
        }

        let upper = 0,
            middle = Math.floor(this.loadedModules.length / 2),
            lower = this.loadedModules.length - 1;

        while (lower !== middle && upper !== middle) {
            if (module.__loaderPriority === this.loadedModules[middle].__loaderPriority) {
                break;
            }
            if (module.__loaderPriority < this.loadedModules[middle].__loaderPriority) {
                lower = middle;
                middle = Math.floor(upper + (lower - upper) / 2);
                if (middle === 0 || lower === middle) {
                    break;
                }
            }
            else {
                upper = middle;
                middle = Math.floor(upper + (lower - upper) / 2);
                if (middle === this.loadedModules.length - 1 || upper === middle) {
                    middle++;
                    break;
                }
            }
        }
        this.loadedModules.splice(middle, 0, module);
    }

    getLoadedModules () {
        return this.loadedModules;
    }

    loadModule (module, platform) {
        this._loadModuleInternal(module, platform, (ld) => {
            if (ld) {
                if (ld.load) {
                    ld.load.call(ld.platform);
                }
                this.emit('load', module);
            } else {
                this.emit('fail', module.name);
            }
        });
    }

    loadAllModules (platform) {
        let listComplete = false,
            loadCounter = 0,
            completeRun = () => {
                for (let i = 0; i < this.loadedModules.length; i++) {
                    if (this.loadedModules[i].load) {
                        process.nextTick(((module) => {
                            module.load.call(module.platform);
                        }).bind(null, this.loadedModules[i]));
                    }
                }
            };

        this._listModules((mod, complete) => {
            if (!mod) {
                if (loadCounter === 0 && complete) {
                    completeRun();
                }
                return;
            }
        
            loadCounter++;
            listComplete = listComplete || complete;
            this._loadModuleInternal(mod, platform, (res) => {
                loadCounter--;
                if (loadCounter === 0 && listComplete) {
                    completeRun();
                }

                if (res) {
                    this.emit('load', mod);
                } else {
                    this.emit('fail', mod.name);
                }
            });
        });
    }

    verifyModule (modulePath) {
        let mod = null;
        for (let i = 0; i < this.loaders.length; i++) {
            mod = this.loaders[i].verifyModule(modulePath);
            if (mod) {
                if (!mod.priority || mod.priority === 'normal') {
                    mod.priority = 0;
                }
                else if (mod.priority === 'first') {
                    mod.priority = Number.MIN_SAFE_INTEGER;
                }
                else if (mod.priority === 'last') {
                    mod.priority = Number.MAX_SAFE_INTEGER;
                }
                else if (typeof mod.priority !== 'number') {
                    continue;
                }
                mod.__loaderUID = i;
                break;
            }
            //console.debug(`Skipping "${path.basename(modulePath)}". It isn't a ${this.loaders[i].name} module.`);
        }
        return mod;
    }

    unloadModule (mod, config, callback) {
        process.nextTick(() => {
            try {
                if (mod.unload) {
                    mod.unload();
                }
                config.saveConfig(mod.name);
                mod.platform = null;
                let index = this.loadedModules.indexOf(mod);
                this.loadedModules.splice(index, 1);
                $$.removeContextIfExists(mod.name);
            } catch (e) {
                console.error($$`Unloading module "${mod.name}" failed.`);
                console.critical(e);
            }
            if (callback) {
                callback();
            }
            this.emit('unload', mod.name);
        });
    }

    unloadAllModules (config, callback) {
        let completedCount = 0;
        const modules = this.loadedModules.slice(),
            completedCallback = () => {
                if (++completedCount === modules.length) {
                    callback();
                }
            };
    
        for (let mod of modules) {
            this.unloadModule(mod, config, completedCallback);
        }
    }
}

module.exports = new ModuleLoader();
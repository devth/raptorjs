raptor.defineClass(
    'optimizer.OptimizedPage',
    function(raptor) {
        "use strict";
        
        var OptimizedPage = function(htmlBySlot, loaderMetadata) {
            this.htmlBySlot = htmlBySlot;
            this.loaderMetadata = loaderMetadata;
        };
        
        OptimizedPage.prototype = {
            getHtmlBySlot: function() {
                return this.htmlBySlot;
            },
            
            getLoaderMetadata: function() {
                return this.loaderMetadata;
            },
            
            getSlotHtml: function(slot) {
                return this.htmlBySlot[slot];
            }
        };
        
        return OptimizedPage;
        
        
    });
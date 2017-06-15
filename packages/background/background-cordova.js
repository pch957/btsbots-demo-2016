BackgroundMode = {
	enabled: new ReactiveVar(false),
	active: new ReactiveVar(false),
	enable: function() {
		cordova.plugins.backgroundMode.enable();
		this.enabled.set(true);
	},
	disable: function() {
		cordova.plugins.backgroundMode.disable();
		this.enabled.set(false);		
	},
	setDefaults: function(defaults) {
		cordova.plugins.backgroundMode.setDefaults(defaults);
	},
	configure: function(options) {
		cordova.plugins.backgroundMode.configure(options);
	}
}

Meteor.startup(function() {
	cordova.plugins.backgroundMode.onactivate = function() {
		BackgroundMode.active.set(true)
	};

	cordova.plugins.backgroundMode.ondeactivate = function() {
		BackgroundMode.active.set(false)
	};
});

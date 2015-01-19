var tamper = require('tamper');
var cheerio = require('cheerio');
var fs = require('fs');

var regex_htmlfile = new RegExp('\\.html');
var regex_list_entry = new RegExp('[\'"].*?[\'"]', 'g');
var regex_quotes = new RegExp('[\'"]', 'g');
var regex_paths_string = new RegExp('paths *?: *?\\{([\\s\\S]*?)\\}');
var regex_paths_entries = new RegExp('\\S+ *?: *?\\S+', 'g');
var regex_paths_item = new RegExp('[\'"]?(\\S+?)[\'"]? *?: *?[\'"]?(\\S+\\w)[\'"]?');
var regex_deps_list = new RegExp('deps *?: *\\[([\\s\\S]*?)\\]');
var regex_define_list = new RegExp('define\\(.*?\\[([\\s\\S]*?)\\],');

function scrapeDeps(filePath, regex, callback) {
	var file = fs.readFileSync(filePath, 'utf-8');
	var dependencyList = file.match(regex);
	var deps = dependencyList[1].match(regex_list_entry);
	for (var idx = 0; idx < deps.length; idx++) {
		callback(deps[idx].replace(regex_quotes, ''));
	}
}

module.exports = function(req, res) {

	if (req.url.match(regex_htmlfile)) {
		return;
	}

	return function (body) {
		var doc = cheerio.load(body);

		// Find the requirejs script
		var init = doc('script#init');

		var paths = {};

		var mainFileName = init.attr('data-main');
		init.removeAttr('data-main');

		var mainFile = fs.readFileSync(dir_serve + '/' + mainFileName, 'utf-8');
		var pathArrayString = mainFile.match(regex_paths_string)[1];
		var pathEntryStrings = pathArrayString.match(regex_paths_entries);
		for (var idx = 0; idx < pathEntryStrings.length; idx++) {
			var match = pathEntryStrings[idx].match(regex_paths_entry);
			if (match[1] && match[2]) {
				paths[match[1]] = match[2];
			}
		}

		var mainFileModule = mainFileName.replace('.js', '');
		paths[mainFileModule] = mainFileModule;

		var processed = {};
		var scripts = [ mainFileModule ];
		function processDependency(dependency) {

			if (processed[dependency]) {
				return;
			}

			var fileName = ( paths[dependency] || dependency ) + '.js';

			// Add the script to the page.
			var script = cheerio.load('<script async />');
			script('script')
				.attr('type', 'text/javascript')
				.attr('data-requirecontext', '_')
				.attr('data-requiremodule', dependency)
				.attr('src', './' + fileName);
			init.append(script.html());

			if (paths[dependency]) {
				processed[dependency] = true;
				return;
			}

			scrapeDeps(fileName, regex_define_list, function(subdependency) {
				if (!subdependency.match(new RegExp('^\\w+!'))) {
					scripts.push(subdependency);
				}
			});

			processed[dependency] = true;
		}

		scrapeDeps(mainFileName, regex_deps_list, processDependency);

		while (scripts.length > 0) {
			processDependency(scripts.pop());
		}

		return doc.html();
	};


};


// zuul test/*.js

// builtin
var child_proc = require('child_process');
var path = require('path');
var fs = require('fs');

// vendor
var browserify = require('browserify');
var express = require('express');
var optimist = require('optimist');

// location of mocha resources
var mocha_path = path.dirname(require.resolve('mocha'));

var cwd = process.cwd();

// html harness
var index = fs.readFileSync(__dirname + '/fixtures/index.html', 'utf-8');

var argv = optimist
    .usage('zuul [options] file(s)|dir')
    .describe('server', 'port to start harness server for manual testing')
    .describe('ui', 'mocha ui (bdd, tdd, qunit, exports')
    .default('ui')
    .argv;

if (argv.help) {
    optimist.showHelp();
    process.exit();
}

if (argv.server && isNaN(parseInt(argv.server))) {
    console.error('--server argument must be a numeric port\n');
    optimist.showHelp(console.error);
    process.exit(-1);
}

// if specified directory, then load mocha opts

// bundle the javascript we are interested in
var bundle = browserify({
    debug: true,
    watch: true
});

// user can specify files or directories
// directories are checked for .js files
argv._.forEach(function(file_or_dir) {
    var stat = fs.statSync(file_or_dir);

    if (stat.isFile()) {
        return bundle.addEntry(file_or_dir);
    }

    // ignore non js and hidden files
    var files = fs.readdirSync(file_or_dir).filter(function(file) {
        return path.extname(file) === '.js' && file[0] !== '.';
    });

    files = files.map(function(file) {
        return path.join(cwd, file_or_dir, file);
    });

    files.forEach(bundle.addEntry.bind(bundle));
});

// options which will be passed to `mocha.setup`
var mocha_opt = {};

// is there a mocha.opts file?
var mocha_opts_path = path.join(cwd, 'test', 'mocha.opts');
if (fs.existsSync(mocha_opts_path)) {
    var content = fs.readFileSync(mocha_opts_path, 'utf8');

    content.split('\n').forEach(function(line) {
        if (line.length === 0) {
            return;
        }

        var split = line.split(' ');

        var key = split.shift().replace('--', '');
        var value = split.join(' ');

        mocha_opt[key] = value;
    });
}

// backwards compat for command line arg
// overrides anything in mocha.opt file
if (argv.ui) {
    mocha_opt.ui = argv.ui;
}

// the default (html) reporter must be used for browser testing
delete mocha_opt.reporter;

// setup http server to serve our harness files
var app = express();
app.get('/', function(req, res) {
    res.send(index.replace('__mocha_opts__', JSON.stringify(mocha_opt)));
});
app.get('/build.js', function(req, res) {
    res.contentType('application/javascript');
    res.send(bundle.bundle());
});
app.get('/mocha.js', function(req, res) {
    res.sendfile(mocha_path + '/mocha.js');
});
app.get('/mocha.css', function(req, res) {
    res.sendfile(mocha_path + '/mocha.css');
});

// go go go!!
var server = app.listen(argv.server);
var port = server.address().port;

// if user just wants a server, then stop here
if (argv.server) {
    console.log('server listening: http://localhost:' + port);
}
// default is to run under phantomjs
else {
    // location of mocha_phantomjs runner
    var mocha_phantom = require.resolve('mocha-phantomjs');
    var phantom = require.resolve('phantomjs');

    if (!mocha_phantom) {
        console.error('mocha-phantomjs is not installed');
        console.error('run: npm install -g mocha-phantomjs');
        process.exit(-1);
    }
    else if (!phantom) {
        console.error('phantomjs is not installed');
        console.error('run: npm install -g phantomjs');
    }

    // launch phantomjs to run the harness files
    var cmd = 'phantomjs';
    var args = [mocha_phantom, 'http://localhost:' + port];

    var child = child_proc.spawn(cmd, args);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on('exit', function(code) {
        server.close();
        process.exit(code);
    });
}
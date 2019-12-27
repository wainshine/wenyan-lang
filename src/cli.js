const fs = require("fs");
const version = require("./version");
const { compile } = require("./parser");
const { render, unrender } = require("./render");
const path = require("path");
const commander = require("commander");

var Logo = ` ,_ ,_\n \\/ ==\n /\\ []\n`;

const program = new commander.Command();
program
  .version(version, "-v, --version", "Output the version")
  .name("wenyan")
  .arguments("[files...]")
  .action(files => {
    if (!files) {
      program.files = [];
    } else if (!Array.isArray(files)) {
      program.files = [files];
    } else {
      program.files = files;
    }
  })
  .option(
    "-l, --lang <lang>",
    'Target language, can be "js", "py" or "rb"',
    "js"
  )
  .option("-c, --compile", "Output the compiled code instead of executing it")
  .option("-e, --eval <code>", "Evaluate script")
  .option("-i, --interactive", "Interactive REPL")
  .option(
    "-o, --output [file]",
    "Output compiled code or executing result to file"
  )
  .option("-r, --render", "Outputs renderings")
  .option(
    "--roman [method]",
    'Romanize identifiers. The method can be "pinyin", "baxter" or "unicode"'
  )
  .option("--log <file>", "Save log to file")
  .option("--title <title>", "Override title in rendering")
  .helpOption("-h, --help", "Display help");

const emptyCall = process.argv.length <= 2;
const showHelp = process.argv.includes("-h") || process.argv.includes("--help");

if (emptyCall || showHelp) {
  program.outputHelp(help => {
    if (!help) return "";
    let text = "\n";
    text += Logo;
    text += `\nWENYAN LANG 文言 Compiler v${version}\n\n`;
    text += help;
    text += "\n";
    return text;
  });
  process.exit();
}

program.parse(process.argv);

preprocess();

if (program.compile) {
  output(getCompiled());
} else if (program.render) {
  doRender();
} else if (program.interactive) {
  intreactive();
} else {
  exec();
}

// ====== Utils ======

function preprocess() {
  if (!program.output && program.render) {
    // render always outputs
    program.output = true;
  }

  if (program.output == true) {
    // only set --option but not the path
    if (!program.files.length) {
      console.error("Can not write to undefined path");
      process.exit(1);
    }
    let base = program.files[0]
      .split(".")
      .slice(0, -1)
      .join(".");
    if (program.compile) program.output = `${base}.${program.lang}`;
    else if (program.render) program.output = `${base}.svg`;
    else program.output = `${base}.log`;
  }

  if (program.roman == true) {
    program.roman = "pinyin";
  }
}

function getCompiled() {
  const source = getSource();
  return compile(program.lang, source, {
    romanizeIdentifiers: program.roman,
    logCallback: logHandler(program.log, "a"),
    errorCallback: function(x) {
      console.error(x);
      process.exit();
    }
  });
}

function resolvePath(x) {
  return path.resolve(x);
}

function getSource() {
  let scripts = program.files
    .map(x =>
      x.endsWith(".svg")
        ? unrender([fs.readFileSync(resolvePath(x)).toString()])
        : fs.readFileSync(resolvePath(x)).toString()
    )
    .join("\n");
  if (program.eval) scripts += `\n${program.eval}`;

  return scripts;
}

function output(data) {
  if (program.output == undefined) return console.log(data);
  else fs.writeFileSync(resolvePath(program.output), data, "utf-8");
}

function getTitle() {
  var title = program.title;
  if (!title && typeof program.output === "string")
    title = program.output
      .split(".")
      .slice(0, -1)
      .join(".");
  if (!title && program.files.length)
    title = program.files[0]
      .split(".")
      .slice(0, -1)
      .join(".");
  return title;
}

function doRender() {
  var svgs = render(getTitle(), getSource(), { plotResult: false });

  var outputEndsWithSvg = program.output.toLowerCase().endsWith(".svg");

  // only one page rendered
  if (svgs.length === 1) {
    if (!outputEndsWithSvg) program.output += ".svg";
    var filepath = resolvePath(program.output);
    fs.writeFileSync(filepath, svgs[0]);
    console.log(filepath); // Outputs generated filename
  }
  // multiple pages rendered, output file as `filename.001.svg` etc
  else {
    if (outputEndsWithSvg) program.output = program.output.slice(0, -4); // remove .svg suffix

    for (var i = 0; i < svgs.length; i++) {
      var filepath = resolvePath(
        `${program.output}.${i.toString().padStart(3, "0")}.svg`
      );
      fs.writeFileSync(filepath, svgs[i]);
      console.log(filepath); // Outputs generated filename
    }
  }
}

function intreactive() {
  if (program.lang !== "js") {
    console.error(
      `Target language "${program.lang}" is not supported for intreactive mode.`
    );
    process.exit(1);
  }
  replscope();
  repl(getCompiled());
}
function exec() {
  if (program.lang !== "js") {
    console.error(
      `Target language "${program.lang}" is not supported for direct executing. Please use --compile option instead.`
    );
    process.exit(1);
  }
  if (program.lang === "js") {
    eval(getCompiled());
  } else if (program.lang === "py") {
    var execSync = require("child_process").execSync;
    fs.writeFileSync("tmp.py", out);
    var ret = execSync(
      "which python3; if [ $? == 0 ]; then python3 tmp.py; else python tmp.py; fi; rm tmp.py",
      { encoding: "utf-8" }
    );
    console.log(ret);
  }
}

function replscope() {
  function generate(depth) {
    var s0 = "global.__scope=new function(){\n";
    var s1 = "\n}";
    for (var i = 0; i < depth; i++) {
      var istr = "__" + ("" + i).padStart(8, "0");
      s0 += `this.evil=function(${istr}){global.__scope=this;var __r=eval(${istr});\n`;
      s1 = `;return __r}` + s1;
    }
    return eval(s0 + s1);
  }
  var stackCallSize = 1000;
  for (var i = stackCallSize; i > 0; i -= 200) {
    try {
      generate(i);
      stackCallSize = i;
      break;
    } catch (e) {
      //console.log(i+ " exceeds max stack size");
    }
  }
  // console.log("final stack size "+stackCallSize);
}

function repl() {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  global.haserr = false;
  rl.question("> ", inp => {
    var out = compile("js", inp, {
      romanizeIdentifiers: program.roman,
      logCallback: logHandler(null, "a"),
      errorCallback: function(x) {
        console.error(x);
        global.haserr = true;
      }
    });
    if (global.haserr) {
      // console.log("Not evaulated.")
    } else {
      // console.log("\x1b[2m" + out + "\x1b[0m");
      try {
        global.__scope.evil(out);
      } catch (e) {
        console.log(e);
      }
    }
    rl.close();
    repl();
  });
}

function logHandler(f, mode) {
  if (!f) {
    return () => 0;
  }

  if (f == "/dev/stdout") {
    return x =>
      typeof x == "string"
        ? console.log(x)
        : console.dir(x, { depth: null, maxArrayLength: null });
  }

  if (f == "/dev/stderr") {
    return console.error;
  }

  if (mode == "a") {
    return x => {
      fs.appendFileSync(
        resolvePath(f),
        (typeof x == "object" ? JSON.stringify(x) : x.toString()) + "\n"
      );
    };
  }

  if (mode == "w") {
    return x => {
      fs.writeFileSync(
        resolvePath(f),
        (typeof x == "object" ? JSON.stringify(x) : x.toString()) + "\n"
      );
    };
  }
}

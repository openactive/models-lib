const DotNet = require('./generators/dot_net');
const PHP = require('./generators/php');
const Ruby = require('./generators/ruby');
const TypeScript = require('./generators/typescript');

let generators = {
  ".NET": DotNet,
  PHP: PHP,
  Ruby: Ruby,
  TypeScript: TypeScript
};

const program = require("commander");

program.command("list").action(() => {
  let keys = Object.keys(generators);
  console.log("Available languages: ", keys);
});

program
  .command("generate <language>")
  .option("--no-beta", "Disable the beta extension")
  .option("-d, --destination <destination>", "Output directory")
  .option("--method <methodName>")
  .action((language, options) => {
    if (!options.destination) {
      console.error("Destination must be specified");
      return;
    }

    if (!language) {
      console.error("Language must be specified");
      return;
    }

    const Generator = generators[language];
    if (!Generator) {
      console.error("Invalid language specified");
      return;
    }

    let extensions = {
      ...require("./extensions/_extensions")
    };

    if (options.beta) {
      extensions = {
        ...extensions,
        ...require("./extensions/beta.json")
      };
    }

    let action = options.method || "generateModelClassFiles";

    let run = async () => {
      let generator = new Generator(options.destination, extensions);

      await generator.initialize();

      await generator[action].apply(generator);
    };

    run().catch(e => {
      console.error(e);
      process.exit(1);
    });
  });

program.command("schema_models").action(() => {});

program.on("command:*", function() {
  console.error(
    "Invalid command: %s\nSee --help for a list of available commands.",
    program.args.join(" ")
  );
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

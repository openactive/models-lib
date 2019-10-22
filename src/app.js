import DotNet from "./generators/dot_net";
import PHP from "./generators/php";

let generators = {
  ".NET": DotNet,
  PHP: PHP
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

    let generator = new Generator();

    let extensions = {
      ...require("./extensions/_extensions")
    };

    if (options.beta) {
      extensions = {
        ...extensions,
        ...require("./extensions/beta.json")
      };
    }

    generator
      .generateModelClassFiles(options.destination, extensions)
      .catch(e => console.error(e));
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

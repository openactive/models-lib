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
    if (!language) {
      console.error("Invalid language specified");
      return;
    }

    let generator = new Generator();

    let extensions = {};

    if (options.beta) {
      extensions["extensions"] = {
        url: "https://www.openactive.io/extensions/extensions.jsonld",
        heading: "OpenActive Extensions context",
        description: "OpenActive Extension contexts"
      };
      extensions["beta"] = {
        url: "https://www.openactive.io/ns-beta/beta.jsonld",
        heading: "OpenActive Beta Extension properties",
        description:
          "These properties are defined in the [OpenActive Beta Extension](https://openactive.io/ns-beta). The OpenActive Beta Extension is defined as a convenience to help document properties that are in active testing and review by the community. Publishers should not assume that properties in the beta namespace will either be added to the core specification or be included in the namespace over the long term."
      };
      extensions["schema"] = {
        url: "http://schema.org/version/latest/schema.jsonld",
        heading: "Schema.org",
        description: "Schema.org"
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

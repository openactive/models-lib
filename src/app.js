import Generator from './dot_net'

const DATA_MODEL_OUTPUT_DIR = "../OpenActive.NET/";

let EXTENSIONS = {
  "beta": {
    "url": "https://www.openactive.io/ns-beta/beta.jsonld",
    "heading": "OpenActive Beta Extension properties",
    "description": "These properties are defined in the [OpenActive Beta Extension](https://openactive.io/ns-beta). The OpenActive Beta Extension is defined as a convenience to help document properties that are in active testing and review by the community. Publishers should not assume that properties in the beta namespace will either be added to the core specification or be included in the namespace over the long term.",
  },
};

let generator = new Generator();

generator.generateModelClassFiles(DATA_MODEL_OUTPUT_DIR, EXTENSIONS);

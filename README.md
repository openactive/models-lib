# models-lib [![Model Generation](https://github.com/openactive/models-lib/actions/workflows/generate-models.yaml/badge.svg?branch=master)](https://github.com/openactive/models-lib/actions/workflows/generate-models.yaml)
Supporting code and tooling for OpenActive models, common across all languages

OpenActive aims to support implementers with models written in [PHP](https://github.com/openactive/models-php), [Ruby](https://github.com/openactive/models-ruby), [.NET](https://github.com/openactive/OpenActive.NET) and [JavaScript/TypeScript](https://github.com/openactive/models-ts). This repository is intended to hold resources (e.g. generators, tests) shared across all of the above.

## Installation

Clone this project:
```
git clone https://github.com/openactive/models-lib.git
```

This project requires Node v14 (npm v6).
A `.nvmrc` file is provided for clarity.

Install dependencies:
```
npm install
```

## Usage

List languages available:
```bash
npm start -- list
```

Generate language files:
```bash
npm start -- generate <language> --destination <folder>
```

### Specific examples

PHP:

```bash
npm start -- generate PHP --destination ../models-php/src/
```

Ruby:

```bash
npm start -- generate Ruby --destination ../models-ruby/lib/openactive/
```

.NET:

```bash
npm start -- generate .NET --destination ../OpenActive.NET/OpenActive.NET/
```

JavaScript/TypeScript:

```bash
npm start -- generate TypeScript --destination ../models-ts/src/
```


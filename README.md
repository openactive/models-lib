# models-lib
Supporting code and tooling for OpenActive models, common across all languages

OpenActive aims to support implementers with models written in [PHP](https://github.com/openactive/models-php), [Ruby](https://github.com/openactive/models-ruby), and [.NET](https://github.com/openactive/OpenActive.NET). This repository is intended to hold resources (e.g. generators, tests) shared across all of the above.

## Installation

Clone this project:
```
git clone https://github.com/openactive/models-lib.git
```

This project requires Node v12 (npm v6).
A `.nvmrc` file is provided for clarity.

Install dependencies:
```
npm install
```

## Usage

List languages available:
```
npm run app-dev -- list
```

Generate language files:
```
npm run app-dev -- generate <language> --destination <folder>
```

### Specific examples

PHP:

```jsx
npm run app-dev -- generate PHP --destination ../../PHP/models-php/src/
```

Ruby:

```jsx
npm run app-dev -- generate Ruby --destination ../Ruby_Spike/lib/openactive/
```

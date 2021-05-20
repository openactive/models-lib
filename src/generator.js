const { getEnums, getMetaData, getModels, getProperties, getSchemaOrgVocab } = require('@openactive/data-models');
const { constants : fsConstants, promises : fs } = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const isobject = require('isobject');
const jsonld = require('jsonld');
const Handlebars = require('handlebars');
const axios = require('axios');

class Generator {
  constructor(dataModelDirectory, extensions) {
    // Returns the latest version of the models map
    this.dataModelDirectory = dataModelDirectory;
    this.extensions = extensions;
    this.cache = [];

    this.models = getModels();
    this.enumMap = getEnums();
    this.namespaces = getMetaData().namespaces;
    /** @type {string[]} */
    this.generatedFiles = [];

    jsonld.documentLoader = this.customLoader.bind(this);
  }

  // memoize the promise by overwriting the function with resulting promise
  initialize() {
    let prom = this._initialize();
    return (this.initialize = () => Promise.resolve(prom));
  }

  async _initialize() {
    this.reindexEnums();

    this.extensions = this.mutateExtensions(this.extensions);

    await this.loadExtensions(this.extensions);
  }

  async setupHandlebars() {}

  mutateExtensions(extensions) {
    return extensions;
  }

  get generateSchemaOrgModel () {
    return false;
  }

  async dumpStructures() {
    await this.initialize();

    await fs.writeFile("namespaces.json", JSON.stringify(this.namespaces, null, 2));
    await fs.writeFile("models.json", JSON.stringify(this.models, null, 2));
    await fs.writeFile("enums.json", JSON.stringify(this.enumMap, null, 2));

    let all = {
      "@context": this.namespaces,
      "@graph": {
        ...this.models,
        ...this.enumMap
      }
    };

    await fs.writeFile("all.json", JSON.stringify(all, null, 2));
  }

  async dumpTemplateData() {
    await this.initialize();

    let data = {};

    for (let typeName of this.sortedModels) {
      let model = this.models[typeName];
      //ignores "model_list.json" (which appears to be ignored everywhere else)

      let pageContent = await this.createModelData(model, this.extensions);
      let keyName = this.getModelFilename(model);

      data[keyName] = pageContent;
    }

    for (let typeName of Object.keys(this.enumMap)) {
      let thisEnum = this.enumMap[typeName];

      // filter off schema enums for langs that don't need it
      if (!this.extensions["schema"] && this.includedInSchema(typeName))
        continue;

      let pageContent = await this.createEnumDataForEnumType(typeName, thisEnum);
      let keyName = this.getEnumFilename(typeName);

      data[keyName] = pageContent;
    }

    await fs.writeFile("template_data.json", JSON.stringify(data, null, 2));
  }

  async cleanModelDirs() {
    this.getDirs().forEach(dir => {
      fsExtra.emptyDirSync(this.dataModelDirectory + "/" + dir);
    });

    await this.dumpStructures();
  }

  /**
   * Override this to filter out some models for this language.
   *
   * @param {string} typeName
   */
  filterModel(typeName, model) {
    return true;
  }

  async generateModelClassFiles() {
    await this.initialize();
    await this.cleanModelDirs();
    await this.setupHandlebars();

    for (let typeName of this.sortedModels) {
      let model = this.models[typeName];
      if (!this.filterModel(typeName, model)) {
        console.log('Skipping model:', typeName);
        continue;
      }
      let pageContent = await this.createModelFile(model, this.extensions);
      if (!isobject(pageContent)) {
        let pageName = this.getModelFilename(model);

        pageContent = {
          [pageName]: pageContent
        };
      }
      await this.savePage(pageContent);
    }
    // Converts the enum map into an array for ease of use
    // filter(typeName => !this.includedInSchema(enumMap[typeName].namespace)).
    for (let typeName of Object.keys(this.enumMap)) {
      let thisEnum = this.enumMap[typeName];

      // filter off schema enums for langs that don't need it
      if ((!this.extensions["schema"] && this.includedInSchema(typeName)) && !thisEnum.isSchemaPending) {
        continue;
      }

      let pageContent = await this.createEnumFile(typeName, thisEnum);
      if (!isobject(pageContent)) {
        let pageName = this.getEnumFilename(typeName);

        pageContent = {
          [pageName]: pageContent
        };
      }
      await this.savePage(pageContent);
    }

    // Create the Property enumeration file
    let pageContent = await this.createPropertiesEnumFile(this.propertyEnumerationName);
    if (!isobject(pageContent)) {
      let pageName = this.getEnumFilename(this.propertyEnumerationName);

      pageContent = {
        [pageName]: pageContent
      };
    }
    await this.savePage(pageContent);
    
    if (this.createIndexFiles && typeof this.createIndexFiles === "function") {
      let pageContent = await this.createIndexFiles();

      await this.savePage(pageContent);
    }
  }

  get propertyEnumerationName() {
    return 'PropertyEnumeration';
  }

  get sortedNamespaces() {
    return Object.keys(this.namespaces).sort((a, b) => {
      let valA = this.namespaces[a];
      let valB = this.namespaces[b];

      if (isobject(valA)) return 1;
      if (isobject(valB)) return -1;

      return valB.length - valA.length;
    });
  }

  get sortedModels() {
    let models = Object.keys(this.models).filter(
      name => !!name && name !== "undefined"
    );
    return models.sort((a, b) => {
      let aChain = this.createModelChain(a);
      let bChain = this.createModelChain(b);

      let result = aChain.length - bChain.length;

      if (result === 0) {
        let aName = this.getPropNameFromFQP(a);
        let bName = this.getPropNameFromFQP(b);

        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
      }

      return result;
    });
  }

  get entities() {
    return {
      ...this.models,
      ...this.enumMap
    };
  }

  createModelChain(modelName) {
    let model = this.entities[modelName];
    if (!model) return null;

    let parentName = this.getCompacted(model.subClassOf || model.derivedFrom);

    if (parentName) {
      let parent = this.createModelChain(parentName);
      if (parent) {
        return [...parent, modelName];
      }
    }
    return [modelName];
  }

  /**
   * returns an array listing every inheritance route
   *
   * @code createModelTree("schema:PaymentCard")
   *        [ [ 'schema:PaymentCard',
   *           'schema:PaymentMethod',
   *           'schema:Enumeration',
   *           'schema:Intangible',
   *           'schema:Thing' ],
   *          [ 'schema:PaymentCard',
   *           'schema:FinancialProduct',
   *           'schema:Service',
   *           'schema:Intangible',
   *           'schema:Thing' ] ]
   * ```
   *
   * @param modelName
   * @returns {Array}
   */
  createModelTree(modelName) {
    const _createModelTree = (modelName, tree = [], path = []) => {
      modelName = this.getCompacted(modelName);

      let model = this.models[modelName];
      let parentNames = [];

      if (model) {
        parentNames = model.subClassesOf;
        // todo: perhaps remove included in schema check
        if (
          !parentNames &&
          model.derivedFrom &&
          this.includedInSchema(model.derivedFrom)
        ) {
          parentNames = [model.derivedFrom];
        }

        if (parentNames) {
          // filter off classes that we don't have (i.e. rdfs:Class)
          parentNames = parentNames.filter(parent => {
            let compacted = this.getCompacted(parent);

            let context = this.getNamespace(compacted)[0];

            return !["rdf", "rdfs", "skos"].includes(context);
          });
        }
      } else if (this.enumMap[modelName]) {
        // this is an enumeration
        parentNames = ["schema:Enumeration"];
      }

      path = [...path, modelName];

      if (!parentNames || parentNames.length === 0) {
        tree.push(path);
        return tree;
      }

      for (let parent of parentNames) {
        _createModelTree(parent, tree, path);
      }

      return tree;
    };

    return _createModelTree(modelName);
  }

  async savePage(pageContent) {
    for (let filename of Object.keys(pageContent)) {
      let fileContent = pageContent[filename];

      let fullpath = this.dataModelDirectory + filename;

      let dir = path.dirname(fullpath);

      try {
        await fs.access(dir, fsConstants.R_OK);
      } catch (_e) {
        await fs.mkdir(dir);
      }

      await fs
        .writeFile(fullpath, fileContent)
        .then(() => {
          this.generatedFiles.push(filename);

          console.log("FILE SAVED: " + filename);
        })
        .catch(err => {
          console.error(err);
        });
    }
  }

  async loadExtensions(extensions) {
    let extensionData = {};

    let promises = [];
    for (let prefix of Object.keys(extensions)) {
      extensions[prefix].prefix = prefix;
      if (extensions[prefix].spec) {
        continue;
      }

      let promise = this.getExtension(extensions[prefix].url).then(
          extension => {
            if (!extension) throw "Error loading extension: " + prefix;

            console.log("loaded ", prefix);

            extensions[prefix].spec = extension;
          }
      );

      promises.push(promise);
    }
    await Promise.all(promises);

    // Load in the Schema Org model if required
    if (this.generateSchemaOrgModel) {
      extensions.schema = {
        prefix: "schema",
        heading: "Schema.org",
        description: "Schema.org",
        spec: getSchemaOrgVocab(),
        preferOA: false,
      }
    }

    // Add all extensions and namespaces first, in case they reference each other
    for (let prefix of Object.keys(extensions)) {
      let extension = extensions[prefix].spec;

      if (!extension) {
        continue;
      }

      this.storeNamespaces(extension["@context"]);
    }

    await Promise.all(
      Object.keys(extensions).map(async prefix => {
        let extension = extensions[prefix].spec;

        if (!extension || !extension["@graph"]) {
          return;
        }

        if (prefix == "beta") {
          Object.assign(extension["@context"][1], {
            isArray: "https://openactive.com/ns-noncompliant#isArray"
          });
        }

        let expanded = await jsonld.compact(extension, extension["@context"]);
        let compacted = await jsonld.compact(expanded, this.namespaces);

        extensions[prefix].graph = compacted["@graph"];
      })
    );

    for (let prefix of Object.keys(extensions)) {
      let extension = extensions[prefix];
      if (extension.graph) {
        await this.augmentWithExtension(extension);
        this.augmentEnumsWithExtension(extension.graph, extension.url, prefix);
      }
    }

    await this.fillAugmentedSubclasses();
  }

  storeNamespaces(context) {
    if (Array.isArray(context)) {
      for (let item of context) {
        this.storeNamespaces(item);
      }
    } else if (typeof context === "object") {
      Object.assign(this.namespaces, context);
    }
  }

  /**
   * @param {string} string
   */
  static lowercaseFirstLetter(string) {
    return `${string[0].toLowerCase()}${string.slice(1)}`;
  }

  createModelData(model, extensions) {
    console.log("Generating model ", model.type);

    let fullFields = this.includeInheritedFields ?
      this.augmentWithParentFields({}, model, this.models, [])
      : this.disinheritNotInSpecFields(model, this.models);
    let fullFieldsList = Object.values(fullFields)
      .sort(this.compareFields)
      .map((field, index) => {
        field.order = index + 6;
        return field;
      });

    let derivedFrom = this.getPropertyWithInheritance("derivedFrom", model);

    let inherits = this.calculateInherits(model.subClassOf, derivedFrom, model);

    // Note hasBaseClass is used here to ensure that assumptions about schema.org fields requiring overrides are not applied if the base class doesn't exist in the model
    let hasBaseClass = this.hasBaseClass(model.subClassOf, derivedFrom);

    let doc = this.createModelDoc(model);

    const modelTypePropName = this.getPropNameFromFQP(model.type);
    const className = this.convertToClassName(modelTypePropName);
    const data = {
      classDoc: doc,
      /**
       * Symbol name to use for class/type - it differentiates from modelType/modelTypePropName as it disallows
       * whatever letters the programming language disallows for its symbol names e.g. 3 -> Three
       *
       * e.g. ThreeDModel
       */
      className,
      /**
       * Symbol name to use for variable names in camel-case languages where variables start with a lowercase letter.
       *
       * Useful for example code in documentation.
       *
       * e.g. threeDModel
       */
      classNameFirstLetterLowercased: Generator.lowercaseFirstLetter(className),
      inherits: inherits,
      /** e.g. schema:3DModel */
      modelType: model.type,
      /** e.g. 3DModel */
      modelTypePropName,
      fieldList: this.createTableFromFieldList(
        fullFieldsList,
        hasBaseClass,
        model
      ),
      fullFields: fullFields
    };

    return data;
  }

  createModelFile(model, extensions) {
    let data = this.createModelData(model, extensions);

    return this.renderModel(data);
  }

  /**
   * Create enum data used for rendering enum mustache files.
   *
   * @param {string} enumType
   * @param {any[]} values
   * @param {string | string[]} doc
   */
  createEnumData(enumType, values, doc) {
    const typeName = this.convertToClassName(this.getPropNameFromFQP(enumType));
    return {
      /** e.g. schema:MeasurementTypeEnumeration */
      enumType,
      /**
       * Symbol name to use for class/type - it differentiates from modelType/modelTypePropName as it disallows
       * whatever letters the programming language disallows for its symbol names e.g. 3 -> Three
       *
       * e.g. MeasurementTypeEnumeration
       */
      typeName,
      /**
       * Symbol name to use for variable names in camel-case languages where variables start with a lowercase letter.
       *
       * Useful for example code in documentation.
       *
       * e.g. measurementTypeEnumeration
       */
      typeNameFirstLetterLowercased: Generator.lowercaseFirstLetter(typeName),
      enumDoc: doc,
      values: values
    };
  }

  createEnumDataForEnumType(enumType, thisEnum) {
    console.log("Generating enum ", enumType);

    let doc = this.createEnumDoc(enumType, thisEnum);

    let values = [];
    // enums imported in from extensions have fqValues,
    //   whereas first party data-models only have values
    if (thisEnum.fqValues) {
      values = thisEnum.fqValues.map(value => ({
        memberVal: this.expandPrefix(value),
        value: this.getPropNameFromFQP(value)
      }));
    } else {
      values = thisEnum.values.map(value => ({
        memberVal: thisEnum.namespace + value,
        value: value
      }));
    }

    return this.createEnumData(enumType, values, doc);
  }

  createEnumFile(typeName, thisEnum) {
    let data = this.createEnumDataForEnumType(typeName, thisEnum);

    return this.renderEnum(data);
  }
  
  createPropertiesEnumFile(enumType) {
    console.log("Generating enum ", enumType);

    // Create enum values from property list
    const values = [...getProperties()].map(value => ({
      memberVal: value,
      value: this.convertToClassName(this.getPropNameFromFQP(value))
    }));

    const doc = this.cleanDocLines(['This enumeration contains a value for all properties in the https://schema.org/ and https://openactive.io/ vocabularies.']);
    const data = this.createEnumData(enumType, values, doc);

    return this.renderEnum(data);
  }

  async loadTemplate(path) {
    return Handlebars.compile(await fs.readFile(path, "utf8"));
  }

  createCommentFromDescription(description) {
    if (description === null || description === undefined) return "";
    if (description.sections) {
      return (
        description.sections
          .map(section =>
            section.title && section.paragraphs ? `
` + section.title + `: ` + section.paragraphs.join(" ") : "")
          .join("\n\n") + "\n"
      );
    } else {
      return "";
    }
  }

  createDescription(field) {
    let lines = [];
    if (field.requiredContent) {
      lines.push(
        "Must always be present and set to " +
          this.renderCode(
            field.requiredContent,
            field.fieldName,
            field.requiredType
          )
      );
    } else {
      const deprecationNotice = field.deprecationGuidance ? `[DEPRECATED: ${field.deprecationGuidance}]` : null;
      const propertyWarning = this.extensions[field.extensionPrefix] && this.extensions[field.extensionPrefix].propertyWarning;
      lines = [
        deprecationNotice || propertyWarning,
        ...field.description
      ];

      lines.concat(field.description);
    }
    return this.cleanDocLines(lines);
  }

  createCodeExample(field) {
    if (!field.example) {
      return [];
    }

    let lines = [];

    lines.push(
      this.renderCode(field.example, field.fieldName, field.requiredType)
    );

    return this.cleanDocLines(lines);
  }

  createTableFromFieldList(fieldList, hasBaseClass, model) {
    return fieldList
      .filter(
        field => field.fieldName != "type" && field.fieldName != "@context"
      )
      .map(field =>
        // note: not changing call for now as this goes into language implementation
        this.createPropertyFromField(
          field,
          this.models,
          this.enumMap,
          hasBaseClass,
          model
        )
      );
  }

  augmentWithExtension(extension) {
    let { graph: extModelGraph, prefix: extensionPrefix } = extension;

    // Add classes first
    extModelGraph.forEach(node => {
      if (!node.subClassOf) {
        node.subClassOf = [];
      } else if (!Array.isArray(node.subClassOf)) {
        node.subClassOf = [node.subClassOf];
      }

      if (node.type === "Class" && node.subClassOf[0] != "schema:Enumeration") {
        let subClasses = node.subClassOf;

        let model = {
          type: node.id,
          extension: extensionPrefix
        };

        if (subClasses.length > 0) {
          Object.assign(model, {
            // Include first relevant subClass in list (note this does not currently support multiple inheritance), which is discouraged in OA modelling anyway
            rawSubClasses: subClasses
          });
        }

        // models[this.getPropNameFromFQP(node.id)] = model;
        this.models[node.id] = model;
      }
    });

    // Add properties to classes
    extModelGraph.forEach(node => {
      if (node.type === "Property") {
        if (!node.rangeIncludes) {
          node.rangeIncludes = [];
        }
        if (!node.domainIncludes) {
          node.domainIncludes = [];
        }

        if (!Array.isArray(node.domainIncludes)) {
          node.domainIncludes = [node.domainIncludes];
        }
        if (!Array.isArray(node.rangeIncludes)) {
          node.rangeIncludes = [node.rangeIncludes];
        }

        let field = {
          memberName: node.id,
          fieldName: this.getPropNameFromFQP(node.id),
          alternativeTypes: node.rangeIncludes.map(type =>
            this.expandPrefix(type, node["@container"] == "@list")
          ),
          description: [
            node.comment +
              (node.discussionUrl
                ? "\n\nIf you are using this property, please join the discussion at proposal " +
                  this.renderGitHubIssueLink(node.discussionUrl) +
                  "."
                : "")
          ],
          example: node.example,
          extensionPrefix: extensionPrefix,
          ...{ 
            deprecationGuidance: extension.prefix === 'beta' && node.supersededBy ? `This term has graduated from the beta namespace and is highly likely to be removed in future versions of this library, please use \`${this.getPropNameFromFQP(node.supersededBy)}\` instead.` : undefined
          },
          raw: node
        };

        node.domainIncludes.forEach(prop => {
          // pending schema stuff in extensions are defined as pending:, but the pending
          // json ld identifies itself as schema:
          prop = prop.replace(/^pending:/, "schema:");

          let model;
          if (extension.preferOA) {
            model =
              this.models[this.getPropNameFromFQP(prop)] || this.models[prop];
          } else {
            model = this.models[prop];
          }

          if (model) {
            model.extensionFields = model.extensionFields || [];
            model.fields = model.fields || {};
            model.extensionFields.push(field.fieldName);
            model.fields[field.fieldName] = { ...field };
          } else {
            let isSchema = /^schema:/.test(prop);
            let msg =
              `*** couldn't attach property "${field.fieldName}" onto "${prop}".` +
              (isSchema
                ? ` This is normal for Schema.org. See https://schema.org/docs/extension.html for details.`
                : "");

            if (isSchema) {
              console.info(msg);
            } else {
              console.error(msg);
            }
          }
        });
      }
    });
  }

  // this fixes up the enums coming from data-models
  reindexEnums() {
    let enums = {};

    for (let label of Object.keys(this.enumMap)) {
      let thisEnum = this.enumMap[label];

      let id;

      if (thisEnum.extensionPrefix) {
        id = `${thisEnum.extensionPrefix}:${label}`;
      } else {
        id = this.getCompacted(thisEnum.namespace + label);
      }

      enums[id] = thisEnum;
    }

    this.enumMap = enums;
  }

  augmentEnumsWithExtension(extModelGraph, extensionUrl, extensionPrefix) {
    extModelGraph.forEach(node => {
      if (!node.subClassOf) {
        node.subClassOf = [];
      } else if (!Array.isArray(node.subClassOf)) {
        node.subClassOf = [node.subClassOf];
      }

      if (node.type === "Class" && node.subClassOf[0] == "schema:Enumeration") {
        let label = node.label || node["rdfs:label"];

        let id = node.id;
        if (/^oa:/.test(id)) {
          id = this.getPropNameFromFQP(id);
        }

        this.enumMap[id] = {
          label: label,
          namespace: this.namespaces[extensionPrefix],
          comment: node.comment,
          values: extModelGraph
            .filter(n => n.type == node.id)
            .map(n => n.label),
          fqValues: extModelGraph.filter(n => n.type == node.id).map(n => n.id),
          extensionPrefix: extensionPrefix
        };
      }
    });
  }

  fillAugmentedSubclasses() {
    console.log("Working out known parents");
    // first of all normalize down the parents
    for (let typeName of Object.keys(this.models)) {
      let model = this.models[typeName];
      let extension = this.extensions[model.extension];

      if (!model.rawSubClasses) continue;

      let subclasses = model.rawSubClasses.map(subclass => {
        let compacted = this.getCompacted(subclass);
        let propName = this.getPropNameFromFQP(subclass);

        if (extension.preferOA && this.models[propName]) {
          return "#" + propName;
        }

        if (this.models[compacted]) {
          return subclass;
        }
        return this.expandPrefix(subclass, false);
      });

      model.subClassesOf = subclasses;
    }

    console.log("Calculating inheritance trees");
    for (let typeName of Object.keys(this.models)) {
      let model = this.models[typeName];

      model.tree = this.createModelTree(typeName);
    }

    console.log("Picking the primary parents");
    // another pass utilising the data just filled in above to pick the primary parent.
    for (let typeName of Object.keys(this.models)) {
      let model = this.models[typeName];

      if (!model.subClassesOf) continue;

      let tree = model.tree;

      // filter off any enum paths as these are invalid for class inheritance
      tree = tree.filter(path => {
        if (path.includes("schema:Enumeration")) return false;
        let modelName = path[1];
        if (this.extensions["schema"] && !this.models[modelName]) return false;

        return true;
      });

      if (tree.length > 0) {
        //todo: better path picking, eventually multi-inheritance
        let subClassOf = tree[0][1];
        model.subClassOf = subClassOf.indexOf(':') === -1 ? `#${subClassOf}` : subClassOf;
      }
    }
  }

  generateMemberNames() {
    for (let typeName of Object.keys(this.models)) {
      let model = this.models[typeName];

      let modelPrefix = this.getPrefix(model.type);

      for (let fieldName of Object.keys(model.fields)) {
        let field = model.fields[fieldName];
        let fieldPrefix = this.getPrefix(field.memberName) || modelPrefix;
      }
    }
  }

  expandPrefix(prop, isArray) {
    if (prop.lastIndexOf(":") > -1) {
      let propNs = prop.substring(0, prop.indexOf(":"));
      let propName = prop.substring(prop.indexOf(":") + 1);
      if (this.namespaces[propNs]) {
        if (propNs === "oa") {
          return (isArray ? "ArrayOf#" : "#") + propName;
        } else {
          return (
            (isArray ? "ArrayOf#" : "") + this.namespaces[propNs] + propName
          );
        }
      } else {
        throw "Namespace not found for '" + prop + "'";
      }
    } else return prop;
  }

  renderGitHubIssueLink(url) {
    let splitUrl = url.split("/");
    let issueNumber = splitUrl[splitUrl.length - 1];
    return "[#" + issueNumber + "](" + url + ")";
  }

  getParentModel(model) {
    let subClassOf = model.subClassOf;
    if (!subClassOf) return;

    if (subClassOf.indexOf("#") == 0) {
      subClassOf = subClassOf.substr(1);
    }

    if (this.models[subClassOf]) {
      return this.models[subClassOf];
    } else {
      return false;
    }
  }

  getBaseSchemaClass(model) {
    if (typeof model.derivedFrom !== 'undefined') {
      return model.derivedFrom;
    } else if (typeof model.subClassOf !== 'undefined') {
      if (this.getPrefix(model.subClassOf) === 'schema') {
        return model.subClassOf.replace('schema:', 'https://schema.org/');
      } else {
        const parentModel = this.getParentModel(model);
        if (parentModel) {
            return this.getBaseSchemaClass(parentModel);
        }
      }
    }

    return null;
  }

  getPropertyWithInheritance(prop, model) {
    if (model[prop]) return model[prop];

    let parentModel = this.getParentModel(model);
    if (parentModel) {
      return this.getPropertyWithInheritance(prop, parentModel);
    }

    return null;
  }

  getMergedPropertyWithInheritance(prop, model) {
    let thisProp = model[prop] || [];
    let parentModel = this.getParentModel(model);
    if (parentModel) {
      return thisProp.concat(
        this.getMergedPropertyWithInheritance(prop, parentModel)
      );
    } else {
      return thisProp;
    }
  }

  disinheritNotInSpecFields(model) {
    let augFields = { ...model.fields };

    let parentModel = this.getParentModel(model);
    if (model.notInSpec && model.notInSpec.length > 0)
      model.notInSpec.forEach(field => {
        if (parentModel && parentModel.fields[field]) {
          if (
            this.getPropNameFromFQP(model.type).toLowerCase() !==
            field.toLowerCase()
          ) {
            // Cannot have property with same name as type, so do not disinherit here
            augFields[field] = { ...parentModel.fields[field] };
            augFields[field].disinherit = true;
          }
        } else {
          // return; // If this error gets thrown, it was previously being skipped, so put this line back in
          throw new Error(
            'notInSpec field "' +
              field +
              '" not found in parent for model "' +
              model.type +
              '"'
          );
        }
      });

    Object.keys(augFields).forEach(field => {
      let thisField = augFields[field];

      if (
        (thisField.sameAs && this.includedInSchema(thisField.sameAs)) ||
        (!thisField.sameAs &&
          model.derivedFrom &&
          this.includedInSchema(model.derivedFrom))
      ) {
        thisField.derivedFromSchema = true;
      }

      if (parentModel && parentModel.fields && parentModel.fields[field]) {
        var parentField = parentModel.fields[field];
        if (parentField.model == thisField.model 
            && parentField.requiredType == thisField.requiredType
            && JSON.stringify(parentField.alternativeModels) == JSON.stringify(thisField.alternativeModels)
            && JSON.stringify(parentField.alternativeTypes) == JSON.stringify(thisField.alternativeTypes)
            && parentField.allowReferencing == thisField.allowReferencing
            && parentField.valueConstraint == thisField.valueConstraint)
        {
            thisField.override = true;
        }
      }
    });

    return augFields;
  }

  compareFields(xField, yField) {
    let x = xField.fieldName.toLowerCase();
    let y = yField.fieldName.toLowerCase();

    const knownPropertyNameOrders = {
      context: 0,
      type: 1,
      id: 2,
      identifier: 3,
      title: 4,
      name: 5,
      description: 6
    };

    function compare(nameA, nameB) {
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }

      // names must be equal
      return 0;
    }

    if (x === "enddate") {
      x = "startdate1";
    } else if (y === "enddate") {
      y = "startdate1";
    }

    let isXKnown = knownPropertyNameOrders.hasOwnProperty(x);
    let isYKnown = knownPropertyNameOrders.hasOwnProperty(y);
    if (isXKnown && isYKnown) {
      let xIndex = knownPropertyNameOrders[x];
      let yIndex = knownPropertyNameOrders[y];
      return compare(xIndex, yIndex);
    } else if (isXKnown) {
      return -1;
    } else if (isYKnown) {
      return 1;
    } else if (xField.extensionPrefix) {
      return 1;
    } else if (yField.extensionPrefix) {
      return -1;
    }

    return compare(x, y);
  }

  createFullModel(fields, partialModel) {
    // Ensure each input prop exists
    let model = {
      requiredFields:
        this.getPropertyWithInheritance("requiredFields", partialModel) || [],
      requiredOptions:
        this.getPropertyWithInheritance("requiredOptions", partialModel) || [],
      recommendedFields:
        this.getPropertyWithInheritance("recommendedFields", partialModel) ||
        [],
      extensionFields:
        this.getMergedPropertyWithInheritance(
          "extensionFields",
          partialModel
        ) || []
    };
    // Get all options that are used in requiredOptions
    let optionSetFields = [];
    model.requiredOptions.forEach(requiredOption => {
      optionSetFields = optionSetFields.concat(requiredOption.options);
    });
    // Create map of all fields
    let optionalFieldsMap = Object.keys(fields).reduce((map, obj) => {
      map[obj] = true;
      return map;
    }, {});
    // Set all known fields to false
    model.requiredFields
      .concat(model.recommendedFields)
      .concat(model.extensionFields)
      .forEach(field => (optionalFieldsMap[field] = false));
    // Create array of optional fields
    let optionalFields = Object.keys(optionalFieldsMap).filter(
      field => optionalFieldsMap[field]
    );

    return {
      requiredFields: this.sortWithIdAndTypeOnTop(model.requiredFields),
      recommendedFields: this.sortWithIdAndTypeOnTop(model.recommendedFields),
      optionalFields: this.sortWithIdAndTypeOnTop(optionalFields),
      extensionFields: this.sortWithIdAndTypeOnTop(model.extensionFields),
      requiredOptions: model.requiredOptions
    };
  }

  augmentWithParentFields(augFields, model, models, notInSpec) {
    if (model.fields) Object.keys(model.fields).forEach(function(field) { 
      if (!augFields[field] && !notInSpec.includes(field)) {
        augFields[field] = model.fields[field];
      }
    });
  
    if (model.hasId && !augFields['@id']) {
      augFields['@id'] = {
          'fieldName': '@id',
          'requiredType': model['idFormat'] || 'http://schema.org/url',
          'description': ['A unique url based identifier for the record'],
          'example': ''
      };
      if (model.hasId && model.sampleId) {
        augFields['@id']['example'] = model['sampleId'] + '12345';
      }
    }
  
    var parentModel = this.getParentModel(model, models);
    if (parentModel) {
      return this.augmentWithParentFields(augFields, parentModel, models, notInSpec.concat(model.notInSpec));
    } else {
      return augFields;
    }
  }

  sortWithIdAndTypeOnTop(arr) {
    let firstList = [];
    if (arr.includes("type")) firstList.push("type");
    if (arr.includes("id")) firstList.push("id");
    let remainingList = arr.filter(x => x != "id" && x != "type");
    return firstList.concat(remainingList.sort());
  }

  convertToCamelCase(str) {
    if (str === null || str === undefined) return null;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  snakeToCanonicalName(name) {
    return name.replace(/(?:^|_)([a-z])/g, matches => {
      return matches.toUpperCase();
    });
  }

  canonicalToSnakeName(name) {
    return name
      .replace(/(?<=[a-z])([A-Z])/g, matches => {
        return "_" + matches;
      })
      .toLowerCase();
  }

  includedInSchema(url) {
    if (!url) return false;

    return this.getNamespace(url)[0] == "schema";
  }

  /**
   * @param {string[]} docLines
   * @returns {string | string[]}
   */
  cleanDocLines(docLines) {
    if (!docLines) {
      return "";
    }

    return docLines
      .filter(val => val)
      .map(val => val.replace(/(?!["`'])(@id|@type|input@name)(?!["`'])/gi, (_, $1) => '`' + $1 + '`'))
      .reduce((acc, val) => acc.concat(val.split("\n")), []);
  }

  createModelDoc(model) {
    let docLines = [
      this.extensions[model.extension] && this.extensions[model.extension].classWarning,
      this.createCommentFromDescription(model.description)
    ];

    if (model.extension !== 'schema') {
      // baseSchemaClass is only used here for information
      var baseSchemaClass = this.getBaseSchemaClass(model);
      if (baseSchemaClass) {
        let text = `This type is derived from ${baseSchemaClass}`;

        if (baseSchemaClass.match(/^https:\/\/schema.org/)) {
          text +=
            ", which means that any of this type's properties within schema.org may also be used";
        }

        text += ".";

        docLines.push(text);
      }
    }

    return this.cleanDocLines(docLines);
  }

  createEnumDoc(typeName, thisEnum) {
    let docLines = [
      this.extensions[thisEnum.extensionPrefix] && this.extensions[thisEnum.extensionPrefix].enumWarning
    ];

    if (thisEnum.comment) {
      docLines.push(thisEnum.comment);
    }

    return this.cleanDocLines(docLines);
  }

  isArray(prop) {
    return prop.indexOf("ArrayOf") == 0;
  }

  // compact a url down, i.e. https://schema.org/SportsActivityLocation to schema:SportsActivityLocation
  getCompacted(url) {
    if (!url) return "";
    if (/^ArrayOf#/.test(url)) url = url.replace(/^ArrayOf#/, "");
    if (!url.match(/^https?:/i)) {
      if (url[0] === "#") {
        url = url.substr(1);
      }
      return url;
    }

    url = url.replace(/^http:/i, "https:");

    for (let key of this.sortedNamespaces) {
      let val = this.namespaces[key];
      if (isobject(val)) continue;

      val = val.replace(/^http:/i, "https:");

      if (url.startsWith(val)) {
        let remainder = url.substr(val.length);

        if (key === "oa") {
          return remainder;
        }

        if (remainder.length === 0 || /^[/#:]$/.test(remainder)) {
          return key;
        }

        return `${key}:${remainder}`;
      }
    }
  }

  getFullNamespace(prop) {
    prop = this.getCompacted(prop);

    let props = prop.split(":");
    return props;
  }

  getNamespace(prop) {
    let props = this.getFullNamespace(prop);
    props.pop();
    return props;
  }

  getPrefix(prop) {
    let ns = this.getNamespace(prop);
    if (!ns) return null;

    return ns[0];
  }

  getPropLinkFromFQP(prop) {
    if (prop.lastIndexOf("/") > -1) {
      return prop.replace("ArrayOf#", "");
    } else if (prop.lastIndexOf("#") > -1) {
      return (
        DATA_MODEL_DOCS_URL_PREFIX +
        prop.substring(prop.lastIndexOf("#") + 1).toLowerCase()
      );
    } else return "#";
  }

  getPropNameFromFQP(prop) {
    if (prop === null || prop === undefined) return null;
    //Just the characters after the last /, # or :
    let match = prop.match(/[/#:]/g);
    let lastIndex =
      match === null ? -1 : prop.lastIndexOf(match[match.length - 1]);
    if (lastIndex > -1) {
      return prop.substring(lastIndex + 1);
    } else return prop;
  }

  hasBaseClass(subClassOf, derivedFrom) {
    if (subClassOf || !derivedFrom) {
      return true;
    }

    return this.includedInSchema(derivedFrom);
  }

  async _request(url) {
    let response = await axios.get(url, {
      Accept: "application/ld+json",
      transformResponse: response => {
        let body = response
          .replace(/http:\/\/schema\.org/g, "https://schema.org")
          .replace(
            /https:\/\/openactive\.io\/ns-beta\//g,
            "https://openactive.io/ns-beta#"
          );

        body = JSON.parse(body);

        return body;
      }
    });

    return response.data;
  }

  async request(url) {
    if (this.cache[url]) {
      console.log(`requesting ${url} (cache hit)`);

      return this.cache[url];
    }

    console.log(`requesting ${url} (cache miss)`);

    this.cache[url] = this._request(url); //no-await

    return this.cache[url];
  }

  async getExtension(extensionUrl) {
    let response = await this.request(extensionUrl);

    if (!response) return;

    if (!response["@context"]) return;
    return response;
  }

  async customLoader(url) {
    let body = await this.request(url);

    return {
      contextUrl: null,
      document: body,
      documentUrl: url
    };
  }
}

module.exports = Generator;

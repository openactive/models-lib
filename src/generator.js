import { getEnums, getMetaData, getModels } from "@openactive/data-models";
import { constants as fsConstants, promises as fs } from "fs";
import fsExtra from "fs-extra";
import path from "path";
import request from "sync-request";
import isobject from "isobject";
import * as jsonld from "jsonld";
import Handlebars from "handlebars";

class Generator {
  async generateModelClassFiles(dataModelDirectory, extensions) {
    // Returns the latest version of the models map
    this.models = getModels();
    this.dataModelDirectory = dataModelDirectory;
    this.enumMap = getEnums();
    this.namespaces = getMetaData().namespaces;
    this.generatedFiles = [];

    if (this.mutateExtensions && typeof this.mutateExtensions === "function") {
      extensions = this.mutateExtensions(extensions);
    }

    await this.loadExtensions(extensions);

    // fs.writeFileSync("models.json", JSON.stringify(this.models, null, 2));

    this.getDirs().forEach(dir => {
      fsExtra.emptyDirSync(dataModelDirectory + "/" + dir);
    });

    if (this.setupHandlebars && typeof this.setupHandlebars === "function") {
      await this.setupHandlebars();
    }

    for (let typeName of Object.keys(this.models)) {
      let model = this.models[typeName];
      if (typeName != "undefined") {
        //ignores "model_list.json" (which appears to be ignored everywhere else)

        let pageContent = await this.createModelFile(model, extensions);
        if (!isobject(pageContent)) {
          let pageName = this.getModelFilename(model);

          pageContent = {
            [pageName]: pageContent
          };
        }
        await this.savePage(pageContent);
      }
    }
    // Converts the enum map into an array for ease of use
    // filter(typeName => !this.includedInSchema(enumMap[typeName].namespace)).
    for (let typeName of Object.keys(this.enumMap)) {
      let thisEnum = this.enumMap[typeName];

      let pageContent = await this.createEnumFile(typeName, thisEnum);
      if (!isobject(pageContent)) {
        let pageName = this.getEnumFilename(typeName);

        pageContent = {
          [pageName]: pageContent
        };
      }
      await this.savePage(pageContent);
    }

    if (this.createIndexFiles && typeof this.createIndexFiles === "function") {
      let pageContent = await this.createIndexFiles();

      await this.savePage(pageContent);
    }
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
          this.generatedFiles.push(fullpath);

          console.log("FILE SAVED: " + filename);
        })
        .catch(err => {
          console.error(err);
        });
    }
  }

  async loadExtensions(extensions) {
    let extensionData = {};

    for (let prefix of Object.keys(extensions)) {
      if (extensions[prefix].spec) {
        continue;
      }

      let extension = await this.getExtension(extensions[prefix].url);
      if (!extension) throw "Error loading extension: " + prefix;

      extensions[prefix].spec = extension;
    }

    // Add all extensions and namespaces first, in case they reference each other
    for (let prefix of Object.keys(extensions)) {
      let extension = extensions[prefix].spec;

      if (!extension) {
        continue;
      }

      this.storeNamespaces(extension["@context"]);
    }

    for (let prefix of Object.keys(extensions)) {
      let extension = extensions[prefix].spec;

      if (!extension || !extension["@graph"]) {
        continue;
      }

      let expanded = await jsonld.compact(extension, extension["@context"]);
      let compacted = await jsonld.compact(expanded, this.namespaces);

      extensions[prefix].graph = compacted["@graph"];
    }

    Object.keys(extensions).forEach(async prefix => {
      let extension = extensions[prefix];
      if (extension.graph) {
        await this.augmentWithExtension(extension.graph, extension.url, prefix);
        this.augmentEnumsWithExtension(extension.graph, extension.url, prefix);
      }
    });
  }

  storeNamespaces(context) {
    if (Array.isArray(context)) {
      context.forEach(context => {
        this.storeNamespaces(this.namespaces, context);
      });
    } else if (typeof context === "object") {
      Object.assign(this.namespaces, context);
    }
  }

  createModelData(model, extensions) {
    let fullFields = this.obsoleteNotInSpecFields(model, this.models);
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

    let data = {
      classDoc: doc,
      className: this.convertToClassName(this.getPropNameFromFQP(model.type)),
      inherits: inherits,
      modelType: model.type,
      fieldList: this.createTableFromFieldList(fullFieldsList, hasBaseClass)
    };

    return data;
  }

  createModelFile(model, extensions) {
    let data = this.createModelData(model, extensions);

    return this.renderModel(data);
  }

  createEnumData(typeName, thisEnum) {
    let doc = this.createEnumDoc(typeName, thisEnum);

    let data = {
      typeName: typeName,
      enumDoc: doc,
      values: thisEnum.values.map(value => ({
        memberVal: thisEnum.namespace + value,
        value: value
      }))
    };

    return data;
  }

  createEnumFile(typeName, thisEnum) {
    let data = this.createEnumData(typeName, thisEnum);

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
            section.title && section.paragraphs
              ? `
## **` +
                section.title +
                `**
` +
                section.paragraphs.join("\n")
              : ""
          )
          .join("\n\n") + "\n"
      );
    } else {
      return "";
    }
  }

  createDescription(field) {
    if (field.requiredContent) {
      return (
        "Must always be present and set to " +
        this.renderCode(
          field.requiredContent,
          field.fieldName,
          field.requiredType
        )
      );
    } else {
      let lines = [
        field.extensionPrefix == "beta" &&
          "[NOTICE: This is a beta field, and is highly likely to change in future versions of this library.]",
        ...field.description
      ];
      lines.concat(field.description);

      return this.cleanDocLines(lines);
    }
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

  createTableFromFieldList(fieldList, hasBaseClass) {
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
          hasBaseClass
        )
      );
  }

  augmentWithExtension(extModelGraph, extensionUrl, extensionPrefix) {
    // Add classes first
    extModelGraph.forEach(node => {
      if (!node.subClassOf) {
        node.subClassOf = [];
      } else if (!Array.isArray(node.subClassOf)) {
        node.subClassOf = [node.subClassOf];
      }

      if (node.type === "Class" && node.subClassOf[0] != "schema:Enumeration") {
        // Only include subclasses for either OA or schema.org classes
        // let subClasses = node.subClassOf.filter(
        //   prop =>
        //     models[this.getPropNameFromFQP(prop)] || this.includedInSchema(prop),
        // );

        let subClasses = node.subClassOf;

        let model =
          subClasses.length > 0
            ? {
                type: node.id,
                // Include first relevant subClass in list (note this does not currently support multiple inheritance), which is discouraged in OA modelling anyway
                subClassOf: this.models[subClasses[0]]
                  ? "#" + this.getPropNameFromFQP(subClasses[0])
                  : this.expandPrefix(subClasses[0], false)
              }
            : {
                type: node.id
              };
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
          fieldName: this.getPropNameFromFQP(node.id),
          alternativeTypes: node.rangeIncludes.map(type =>
            this.expandPrefix(type, node.isArray)
          ),
          description: [
            node.comment +
              (node.githubIssue
                ? "\n\nIf you are using this property, please join the discussion at proposal " +
                  this.renderGitHubIssueLink(node.githubIssue) +
                  "."
                : "")
          ],
          example: node.example,
          extensionPrefix: extensionPrefix
        };
        node.domainIncludes.forEach(prop => {
          let model = this.models[prop];
          if (model) {
            model.extensionFields = model.extensionFields || [];
            model.fields = model.fields || {};
            model.extensionFields.push(field.fieldName);
            model.fields[field.fieldName] = field;
          }
        });
      }
    });
  }

  augmentEnumsWithExtension(extModelGraph, extensionUrl, extensionPrefix) {
    extModelGraph.forEach(node => {
      if (
        node.type === "Class" &&
        Array.isArray(node.subClassOf) &&
        node.subClassOf[0] == "schema:Enumeration"
      ) {
        this.enumMap[node.label] = {
          namespace: this.namespaces[extensionPrefix],
          comment: node.comment,
          values: extModelGraph
            .filter(n => n.type == node.id)
            .map(n => n.label),
          extensionPrefix: extensionPrefix
        };
      }
    });
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

  getExtension(extensionUrl) {
    let response = request("GET", extensionUrl, {
      accept: "application/ld+json"
    });
    if (response && response.statusCode == 200) {
      let rawbody = response.body.toString("utf8");

      rawbody = rawbody.replace(/http:\/\/schema\.org/g, "https://schema.org");

      let body = JSON.parse(rawbody);
      return body["@context"] ? body : undefined;
    } else {
      return undefined;
    }
  }

  getParentModel(model) {
    if (model.subClassOf && model.subClassOf.indexOf("#") == 0) {
      return this.models[model.subClassOf.substring(1)];
    } else {
      return false;
    }
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

  obsoleteNotInSpecFields(model) {
    let augFields = Object.assign({}, model.fields);

    let parentModel = this.getParentModel(model);
    if (model.notInSpec && model.notInSpec.length > 0)
      model.notInSpec.forEach(field => {
        if (parentModel && parentModel.fields[field]) {
          if (
            this.getPropNameFromFQP(model.type).toLowerCase() !==
            field.toLowerCase()
          ) {
            // Cannot have property with same name as type, so do not disinherit here
            augFields[field] = Object.assign({}, parentModel.fields[field]);
            augFields[field].obsolete = true;
          }
        } else {
          return;
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
        thisField.override = true;
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

  cleanDocLines(docLines) {
    if (!docLines) {
      return "";
    }

    return docLines
      .filter(val => val)
      .reduce((acc, val) => acc.concat(val.split("\n")), []);
  }

  createModelDoc(model) {
    let derivedFrom = this.getPropertyWithInheritance("derivedFrom", model);
    let derivedFromName = this.convertToCamelCase(
      this.getPropNameFromFQP(derivedFrom)
    );

    let docLines = [
      this.getPropNameFromFQP(model.type) !== model.type &&
        !model.type.startsWith("schema:") &&
        `[NOTICE: This is a beta class, and is highly likely to change in future versions of this library.].`,
      this.createCommentFromDescription(model.description)
    ];

    if (derivedFrom) {
      let text = `This type is derived from [${derivedFromName}](${derivedFrom})`;

      if (derivedFrom.indexOf("schema.org")) {
        text +=
          ", which means that any of this type's properties within schema.org may also be used. Note however the properties on this page must be used in preference if a relevant property is available";
      }

      text += ".";

      docLines.push(text);
    }

    return this.cleanDocLines(docLines);
  }

  createEnumDoc(typeName, thisEnum) {
    let docLines = [];

    if (thisEnum.extensionPrefix == "beta") {
      docLines.push(
        "[NOTICE: This is a beta enumeration, and is highly likely to change in future versions of this library.]"
      );
    }

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
    if (!url.match(/^https?:/i)) return url;

    url = url.replace(/^http:/i, "https:");

    for (let key of Object.keys(this.namespaces)) {
      let val = this.namespaces[key];
      if (isobject(val)) continue;

      val = val.replace(/^http:/i, "https:");

      if (url.startsWith(val)) {
        let remainder = url.substr(val.length, -1);

        return `${key}:${remainder}`;
      }
    }
  }

  getNamespace(prop) {
    prop = this.getCompacted(prop);

    let props = prop.split(":");
    props.pop();
    return props;
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
    if (prop && prop.toLowerCase().indexOf("event") >= 0) {
      console.log(prop);
    }
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

    return !this.includedInSchema(derivedFrom);
  }
}

export default Generator;

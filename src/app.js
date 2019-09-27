const DATA_MODEL_OUTPUT_DIR = "../OpenActive.NET/";
const DATA_MODEL_DOCS_URL_PREFIX = "https://developer.openactive.io/data-model/types/";

const {getModels, getEnums, getMetaData} = require("@openactive/data-models");
let fs = require("fs");
let fsExtra = require("fs-extra");
let request = require("sync-request");
let path = require("path");

let EXTENSIONS = {
  "beta": {
    "url": "https://www.openactive.io/ns-beta/beta.jsonld",
    "heading": "OpenActive Beta Extension properties",
    "description": "These properties are defined in the [OpenActive Beta Extension](https://openactive.io/ns-beta). The OpenActive Beta Extension is defined as a convenience to help document properties that are in active testing and review by the community. Publishers should not assume that properties in the beta namespace will either be added to the core specification or be included in the namespace over the long term.",
  },
};

class Generator {
  generateModelClassFiles (dataModelDirectory, extensions) {
    // Empty output directories
    fsExtra.emptyDirSync(DATA_MODEL_OUTPUT_DIR + "models");
    fsExtra.emptyDirSync(DATA_MODEL_OUTPUT_DIR + "enums");

    // Returns the latest version of the models map
    const models = getModels();
    const enumMap = getEnums();
    const namespaces = getMetaData().namespaces;

    // Add all extensions and namespaces first, in case they reference each other
    Object.keys(extensions).forEach((prefix) => {
      let extension = this.getExtension(extensions[prefix].url);
      if (!extension) throw "Error loading extension: " + prefix;

      extensions[prefix].graph = extension["@graph"];
      extension["@context"].forEach((context) => {
        if (typeof context === "object") {
          Object.assign(namespaces, context);
        }
      });
    });

    Object.keys(extensions).forEach((prefix) => {
      let extension = extensions[prefix];
      this.augmentWithExtension(extension.graph, models, extension.url, prefix,
        namespaces);
      this.augmentEnumsWithExtension(extension.graph, enumMap, extension.url,
        prefix,
        namespaces);
    });

    Object.keys(models).forEach((typeName) => {
      let model = models[typeName];
      if (typeName != "undefined") { //ignores "model_list.json" (which appears to be ignored everywhere else)

        let pageName = "models/" + this.getPropNameFromFQP(model.type) + ".cs";
        let pageContent = this.createModelFile(model, models, extensions,
          enumMap);

        console.log("NAME: " + pageName);
        console.log(pageContent);

        fs.writeFile(DATA_MODEL_OUTPUT_DIR + pageName, pageContent,
          (err) => {
            if (err) {
              return console.log(err);
            }

            console.log("FILE SAVED: " + pageName);
          });
      }
    });

    // Converts the enum map into an array for ease of use
    Object.keys(enumMap).
      filter(typeName => !this.includedInSchema(enumMap[typeName].namespace)).
      forEach((typeName) => {
        let thisEnum = enumMap[typeName];

        let pageName = "enums/" + typeName + ".cs";
        let pageContent = this.createEnumFile(typeName, thisEnum);

        console.log("NAME: " + pageName);
        console.log(pageContent);

        fs.writeFile(DATA_MODEL_OUTPUT_DIR + pageName, pageContent,
          (err) => {
            if (err) {
              return console.log(err);
            }

            console.log("FILE SAVED: " + pageName);
          });
      });
  }

  augmentWithExtension (
    extModelGraph, models, extensionUrl, extensionPrefix, namespaces) {
    // Add classes first
    extModelGraph.forEach((node) => {
      if (node.type === "Class" && Array.isArray(node.subClassOf) &&
        node.subClassOf[0] != "schema:Enumeration") {
        // Only include subclasses for either OA or schema.org classes
        let subClasses = node.subClassOf.filter(
          prop => models[this.getPropNameFromFQP(prop)] ||
            this.includedInSchema(prop));

        let model = subClasses.length > 0 ? {
            "type": node.id,
            // Include first relevant subClass in list (note this does not currently support multiple inheritance), which is discouraged in OA modelling anyway
            "subClassOf": models[this.getPropNameFromFQP(subClasses[0])] ? "#" +
              this.getPropNameFromFQP(subClasses[0]) : this.expandPrefix(
              subClasses[0],
              false, namespaces),
          } :
          {
            "type": node.id,
          };

        models[this.getPropNameFromFQP(node.id)] = model;
      }
    });

    // Add properties to classes
    extModelGraph.forEach((node) => {
      if (node.type === "Property") {
        let field = {
          "fieldName": this.getPropNameFromFQP(node.id),
          "alternativeTypes": node.rangeIncludes.map(
            type => this.expandPrefix(type, node.isArray, namespaces)),
          "description": [
            node.comment + (node.githubIssue
              ? "\n\nIf you are using this property, please join the discussion at proposal " +
              this.renderGitHubIssueLink(node.githubIssue) + "."
              : ""),
          ],
          "example": node.example,
          "extensionPrefix": extensionPrefix,
        };
        node.domainIncludes.forEach((prop) => {
          let model = models[this.getPropNameFromFQP(prop)];
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

  augmentEnumsWithExtension (
    extModelGraph, enumMap, extensionUrl, extensionPrefix, namespaces) {
    extModelGraph.forEach((node) => {
      if (node.type === "Class" && Array.isArray(node.subClassOf) &&
        node.subClassOf[0] == "schema:Enumeration") {
        enumMap[node.label] = {
          "namespace": namespaces[extensionPrefix],
          "comment": node.comment,
          "values": extModelGraph.filter(n => n.type == node.id).
            map(n => n.label),
          "extensionPrefix": extensionPrefix,
        };
      }
    });
  }

  expandPrefix (prop, isArray, namespaces) {
    if (prop.lastIndexOf(":") > -1) {
      let propNs = prop.substring(0, prop.indexOf(":"));
      let propName = prop.substring(prop.indexOf(":") + 1);
      if (namespaces[propNs]) {
        if (propNs === "oa") {
          return (this.isArray ? "ArrayOf#" : "#") + propName;
        } else {
          return (this.isArray ? "ArrayOf#" : "") + namespaces[propNs] +
            propName;
        }
      } else {
        throw "Namespace not found for '" + prop + "'";
      }
    } else return prop;
  }

  renderGitHubIssueLink (url) {
    let splitUrl = url.split("/");
    let issueNumber = splitUrl[splitUrl.length - 1];
    return "[#" + issueNumber + "](" + url + ")";
  }

  getExtension (extensionUrl) {
    let response = request("GET", extensionUrl,
      {accept: "application/ld+json"});
    if (response && response.statusCode == 200) {
      let body = JSON.parse(response.body);
      return body["@graph"] && body["@context"] ? body : undefined;
    } else {
      return undefined;
    }
  }

  getParentModel (model, models) {
    if (model.subClassOf && model.subClassOf.indexOf("#") == 0) {
      return models[model.subClassOf.substring(1)];
    } else {
      return false;
    }
  }

  getPropertyWithInheritance (prop, model, models) {
    if (model[prop]) return model[prop];

    let parentModel = this.getParentModel(model, models);
    if (parentModel) {
      return this.getPropertyWithInheritance(prop, parentModel, models);
    }

    return null;
  }

  getMergedPropertyWithInheritance (prop, model, models) {
    let thisProp = model[prop] || [];
    let parentModel = this.getParentModel(model, models);
    if (parentModel) {
      return thisProp.concat(
        this.getMergedPropertyWithInheritance(prop, parentModel, models));
    } else {
      return thisProp;
    }
  }

  obsoleteNotInSpecFields (model, models) {
    let augFields = Object.assign({}, model.fields);

    let parentModel = this.getParentModel(model, models);
    if (model.notInSpec && model.notInSpec.length > 0) model.notInSpec.forEach(
      (field) => {
        if (parentModel && parentModel.fields[field]) {
          if (this.getPropNameFromFQP(model.type).toLowerCase() !==
            field.toLowerCase()) { // Cannot have property with same name as type, so do not disinherit here
            augFields[field] = Object.assign({}, parentModel.fields[field]);
            augFields[field].obsolete = true;
          }
        } else {
          throw new Error(
            "notInSpec field \"" + field +
            "\" not found in parent for model \"" +
            model.type + "\"");
        }
      });

    Object.keys(augFields).forEach((field) => {
      let thisField = augFields[field];

      if ((thisField.sameAs && this.includedInSchema(thisField.sameAs)) ||
        (!thisField.sameAs && model.derivedFrom &&
          this.includedInSchema(model.derivedFrom))) {
        thisField.derivedFromSchema = true;
      }

      if (parentModel && parentModel.fields[field]) {
        thisField.override = true;
      }
    });

    return augFields;
  }

  calculateInherits (subClassOf, derivedFrom, model) {
    // Prioritise subClassOf over derivedFrom
    if (subClassOf) {
      let subClassOfName = this.convertToCamelCase(
        this.getPropNameFromFQP(subClassOf));
      if (this.includedInSchema(subClassOf)) {
        return `Schema.NET.${subClassOfName}`;
      } else {
        return `${subClassOfName}`;
      }
    } else if (derivedFrom) {
      let derivedFromName = this.convertToCamelCase(
        this.getPropNameFromFQP(derivedFrom));
      if (this.includedInSchema(derivedFrom)) {
        return `Schema.NET.${derivedFromName}`;
      } else {
        // Note if derived from is outside of schema.org there won't be a base class, but it will still be JSON-LD
        return `Schema.NET.JsonLdObject`;
      }
    } else {
      // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
      throw new Error("No base class specified for: " + model.type);
    }
  }

  compareFields (xField, yField) {
    let x = xField.fieldName.toLowerCase();
    let y = yField.fieldName.toLowerCase();

    const knownPropertyNameOrders = {
      "context": 0,
      "type": 1,
      "id": 2,
      "identifier": 3,
      "title": 4,
      "name": 5,
      "description": 6,
    };

    function compare (nameA, nameB) {
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

  createModelFile (model, models, extensions, enumMap) {
    let fullFields = this.obsoleteNotInSpecFields(model, models);
    let fullFieldsList = Object.values(fullFields).
      sort(this.compareFields).
      map((field, index) => {
        field.order = index + 6;
        return field;
      });
    let fullModel = this.createFullModel(fullFields, model, models);
    let derivedFrom = this.getPropertyWithInheritance("derivedFrom", model,
      models);
    let derivedFromName = this.convertToCamelCase(
      this.getPropNameFromFQP(derivedFrom));

    let inherits = this.calculateInherits(model.subClassOf, derivedFrom, model);

    // Note hasBaseClass is used here to ensure that assumptions about schema.org fields requiring overrides are not applied if the base class doesn't exist in the model
    let hasBaseClass = inherits != "Schema.NET.JsonLdObject";

    return `
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace OpenActive.NET
{
    /// <summary>
    /// ${this.getPropNameFromFQP(model.type) != model.type
      ? `[NOTICE: This is a beta class, and is highly likely to change in future versions of this library.]. `
      : ""}${this.createCommentFromDescription(model.description).
      replace(/\n/g, "\n    /// ")}
    /// ${derivedFrom ? `This type is derived from [` + derivedFromName + `](` +
      derivedFrom + `)` + (derivedFrom.indexOf("schema.org") > -1
        ? ", which means that any of this type's properties within schema.org may also be used. Note however the properties on this page must be used in preference if a relevant property is available"
        : "") + "." : ""}
    /// </summary>
    [DataContract]
    public partial class ${this.convertToCamelCase(
      this.getPropNameFromFQP(model.type))} : ${inherits}
    {
        /// <summary>
        /// Gets the name of the type as specified by schema.org.
        /// </summary>
        [DataMember(Name = "@type", Order = 1)]
        public override string Type => "${model.type}";

        ${this.createTableFromFieldList(fullFieldsList, models, enumMap,
      hasBaseClass)}
    }
}
`;

  }

  createEnumFile (typeName, thisEnum) {
    let betaWarning = thisEnum.extensionPrefix == "beta"
      ? "[NOTICE: This is a beta enumeration, and is highly likely to change in future versions of this library.] \n"
      : "";
    return `
using System.Runtime.Serialization;

namespace OpenActive.NET
{
    /// <summary>
    /// ${(betaWarning + (thisEnum.comment || "")).replace(/\n/g, "\n    /// ")}
    /// </summary>
    public enum  ${typeName}
    {
        ${thisEnum.values.map(value => this.createEnumValue(value, thisEnum)).
      join(",")}
    }
}
`;

  }

  createEnumValue (value, thisEnum) {

    return `
        [EnumMember(Value = "${thisEnum.namespace + value}")]
        ${value}`;
  }

  createCommentFromDescription (description) {
    if (description === null || description === undefined) return "";
    if (description.sections) {
      return description.sections.map(
        section => (section.title && section.paragraphs ? `
## **` + section.title + `**
` + section.paragraphs.join("\n") : "")).join("\n\n") + "\n";
    } else {
      return "";
    }
  }

  getDotNetType (fullyQualifiedType, enumMap, modelsMap, isExtension) {
    let baseType = this.getDotNetBaseType(fullyQualifiedType, enumMap,
      modelsMap,
      isExtension);
    if (this.isArray(fullyQualifiedType)) {
      // Remove ? from end of type if it's a list
      if (baseType.slice(-1) == "?") {
        return `List<${baseType.slice(0, -1)}>`;
      } else {
        return `List<${baseType}>`;
      }
    } else {
      return baseType;
    }
  }

  getDotNetBaseType (prefixedTypeName, enumMap, modelsMap, isExtension) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "bool?";
      case "DateTime":
      case "Time":
        return "DateTimeOffset?";
      case "Integer":
        return "int?";
      case "Float":
        return "decimal?";
      case "Number":
        return "decimal?";
      case "Date": // TODO: Find better way of representing Date
      case "Text":
        return "string";
      case "Duration":
        return "TimeSpan?";
      case "URL":
      case "Property":
        return "Uri";
      default:
        if (enumMap[typeName]) {
          if (this.includedInSchema(enumMap[typeName].namespace)) {
            return "Schema.NET." + this.convertToCamelCase(typeName) + "?";
          } else {
            return this.convertToCamelCase(typeName) + "?";
          }
        } else if (modelsMap[typeName]) {
          return this.convertToCamelCase(typeName);
        } else if (isExtension) {
          // Extensions may reference schema.org, for which we have no reference here to confirm
          console.log("Extension referenced schema.org property: " + typeName);
          return "Schema.NET." + this.convertToCamelCase(typeName);
        } else {
          throw new Error("Unrecognised type or enum referenced: " + typeName);
        }
    }
  }

  createTableFromFieldList (fieldList, models, enumMap, hasBaseClass) {
    return fieldList.filter(
      field => field.fieldName != "type" && field.fieldName != "@context").
      map(
        field => this.createPropertyFromField(field, models, enumMap,
          hasBaseClass)).
      join("\n");
  }

  renderJsonConverter (field, propertyType) {
    if (propertyType == "TimeSpan?") {
      return `\n        [JsonConverter(typeof(OpenActiveTimeSpanToISO8601DurationValuesConverter))]`;
    } else if (field.requiredType == "https://schema.org/Time") {
      return `\n        [JsonConverter(typeof(OpenActiveDateTimeOffsetToISO8601TimeValuesConverter))]`;
    } else if (propertyType.indexOf("Values<") > -1) {
      return `\n        [JsonConverter(typeof(ValuesConverter))]`;
    } else {
      return "";
    }
  }

  createPropertyFromField (field, models, enumMap, hasBaseClass) {
    let memberName = field.extensionPrefix
      ? `${field.extensionPrefix}:${field.fieldName}`
      : field.fieldName;
    let isExtension = !!field.extensionPrefix;
    let isNew = field.derivedFromSchema; // Only need new if sameAs specified as it will be replacing a schema.org type
    let propertyName = this.convertToCamelCase(field.fieldName);
    let propertyType = this.createTypeString(field, models, enumMap,
      isExtension);
    let jsonConverter = this.renderJsonConverter(field, propertyType);
    return !field.obsolete ? `
        /// ${this.createDescriptionWithExample(field).
      replace(/\n/g, "\n        /// ")}
        [DataMember(Name = "${memberName}", EmitDefaultValue = false, Order = ${isExtension
      ? 1000 + field.order
      : field.order})]${jsonConverter}
        public ${!isExtension && hasBaseClass && (isNew || field.override)
      ? "new "
      : ""}virtual ${propertyType} ${propertyName} { get; set; }
` : `
        [Obsolete("This property is disinherited in this type, and must not be used.", true)]
        public override ${propertyType} ${propertyName} { get; set; }
`;
  }

  createTypeString (field, models, enumMap, isExtension) {
    let types = [].concat(field.alternativeTypes).
      concat(field.requiredType).
      concat(field.alternativeModels).
      concat(field.model).
      filter(type => type !== undefined);

    types = types.map(
      fullyQualifiedType => this.getDotNetType(fullyQualifiedType, enumMap,
        models,
        isExtension));

    if (types.length == 0) {
      throw new Error("No type found for field: " + field.fieldName);
    }

    // OpenActive SingleValues not allow many of the same type, only allows one
    return types.length > 1 ? `SingleValues<${types.join(", ")}>` : types[0];
  }

  isArray (prop) {
    return prop.indexOf("ArrayOf") == 0;
  }

  getPropLinkFromFQP (prop) {
    if (prop.lastIndexOf("/") > -1) {
      return prop.replace("ArrayOf#", "");
    } else if (prop.lastIndexOf("#") > -1) {
      return DATA_MODEL_DOCS_URL_PREFIX +
        prop.substring(prop.lastIndexOf("#") + 1).toLowerCase();
    } else return "#";
  }

  getPropNameFromFQP (prop) {
    if (prop === null || prop === undefined) return null;
    //Just the characters after the last /, # or :
    let match = prop.match(/[/#:]/g);
    let lastIndex = match === null ? -1 : prop.lastIndexOf(
      match[match.length - 1]);
    if (lastIndex > -1) {
      return prop.substring(lastIndex + 1);
    } else return prop;
  }

  createDescriptionWithExample (field) {
    if (field.requiredContent) {
      return "Must always be present and set to " +
        this.renderCode(field.requiredContent, field.fieldName,
          field.requiredType);
    } else {
      let betaWarning = field.extensionPrefix == "beta"
        ? "[NOTICE: This is a beta field, and is highly likely to change in future versions of this library.] \n"
        : "";
      return `<summary>\n${betaWarning}${field.description.join(
        " \n")}\n</summary>`
        + (field.example ? "\n<example>\n" +
          this.renderCode(field.example, field.fieldName, field.requiredType) +
          "\n</example>" : "");
    }
  }

  renderCode (code, fieldName, requiredType) {
    if (typeof code === "object") {
      return "<code>\n" + (fieldName ? `"` + fieldName + `": ` : "") +
        JSON.stringify(code, null, 2) + "\n</code>";
    } else {
      let isNumber = requiredType &&
        (requiredType.indexOf("Integer") > -1 || requiredType.indexOf("Float") >
          -1);
      return "<code>\n" + (fieldName ? `"` + fieldName + `": ` : "") +
        (isNumber ? code : `"` + code + `"`) + "\n</code>";
    }
  }

  createFullModel (fields, partialModel, models) {
    // Ensure each input prop exists
    let model = {
      requiredFields: this.getPropertyWithInheritance("requiredFields",
        partialModel,
        models) || [],
      requiredOptions: this.getPropertyWithInheritance("requiredOptions",
        partialModel, models) || [],
      recommendedFields: this.getPropertyWithInheritance("recommendedFields",
        partialModel, models) || [],
      extensionFields: this.getMergedPropertyWithInheritance("extensionFields",
        partialModel, models) || [],
    };
    // Get all options that are used in requiredOptions
    let optionSetFields = [];
    model.requiredOptions.forEach((requiredOption) => {
      optionSetFields = optionSetFields.concat(requiredOption.options);
    });
    // Create map of all fields
    let optionalFieldsMap = Object.keys(fields).reduce((map, obj) => {
      map[obj] = true;
      return map;
    }, {});
    // Set all known fields to false
    model.requiredFields.concat(model.recommendedFields).
      concat(model.extensionFields).
      forEach(field => optionalFieldsMap[field] = false);
    // Create array of optional fields
    let optionalFields = Object.keys(optionalFieldsMap).
      filter(field => optionalFieldsMap[field]);

    return {
      requiredFields: this.sortWithIdAndTypeOnTop(model.requiredFields),
      recommendedFields: this.sortWithIdAndTypeOnTop(model.recommendedFields),
      optionalFields: this.sortWithIdAndTypeOnTop(optionalFields),
      extensionFields: this.sortWithIdAndTypeOnTop(model.extensionFields),
      requiredOptions: model.requiredOptions,
    };
  }

  sortWithIdAndTypeOnTop (arr) {
    let firstList = [];
    if (arr.includes("type")) firstList.push("type");
    if (arr.includes("id")) firstList.push("id");
    let remainingList = arr.filter(x => x != "id" && x != "type");
    return firstList.concat(remainingList.sort());
  }

  convertToCamelCase (str) {
    if (str === null || str === undefined) return null;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  includedInSchema (url) {
    if (!url) return false;
    return url.indexOf("//schema.org") > -1 || url.indexOf("schema:") == 0;
  }
}

let generator = new Generator();

generator.generateModelClassFiles(DATA_MODEL_OUTPUT_DIR, EXTENSIONS);


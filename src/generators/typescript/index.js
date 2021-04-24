const Generator = require('../../generator');
const Handlebars = require('handlebars');

class TypeScript extends Generator {
  mutateExtensions(extensions) {
    return {
      ...extensions
    };
  }

  get generateSchemaOrgModel () {
    return true;
  }

  get includeInheritedFields () {
    return true;
  }

  // using inplace of standard namespace
  getBasicNamespace(prop) {
    if (this.includedInSchema(prop)) {
      return ["schema"];
    }
    return [];
  }

  getNamespaceParts(prop, type) {
    return ["OpenActive", type, ...this.getBasicNamespace(prop)].map(name => {
      return this.snakeToCanonicalName(name);
    });
  }

  formatNamespace(parts) {
    return parts.map(part => `::${part}`).join("");
  }

  setupHandlebars() {
    Handlebars.registerHelper("renderPropName", function() {
      return new Handlebars.SafeString(/^[A-Za-z0-9]*$/.test(this.propName) ? this.propName : `'${this.propName}'`);
    });
  }

  async renderIndex(data) {
    this.indexTemplate =
      this.indexTemplate ||
      (await this.loadTemplate(__dirname + "/index.js.mustache"));

    return this.indexTemplate(data);
  }

  async renderModel(data) {
    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.js.mustache"));

    return this.modelTemplate(data);
  }

  async renderEnum(data) {
    this.enumTemplate = this.enumTemplate || {
      main: await this.loadTemplate(__dirname + "/enum.js.mustache")
    };

    let response = {
      [this.getEnumFilename(data)]: this.enumTemplate.main(data)
    };

    return response;
  }

  // TODO: Refactor this to remove string hacks, it is currently dependent on the strings in
  // getDirs, getModelFilename and getEnumFilename
  async createIndexFiles() {
    const getRequireList = (files, dir, prefix) => {
      const list = [];
      for (const file of files) {
        if (file.indexOf(prefix) === 0) {
          const typeName = file.substring(prefix.length, file.length - '.js'.length);
          list.push({
            name: this.convertToClassName(typeName),
            filename: dir + typeName,
          });
        }
      }
      return list;
    };
    const getData = (files, modelPrefix, enumPrefix) => {
      return {
        modelsList: getRequireList(files, './models/', modelPrefix),
        enumsList: getRequireList(files, './enums/', enumPrefix),
      }
    };
    return {
      "/oa/index.js": await this.renderIndex(getData(this.generatedFiles, '/oa/models/', '/oa/enums/' )),
      "/schema/index.js": await this.renderIndex(getData(this.generatedFiles, '/schema/models/', '/schema/enums/')),
    };
  }

  getDirs() {
    return ["schema/", "oa/"];
  }

  getModelFilename(model) {
    if (this.includedInSchema(model.type)) {
      return (
        "/schema/models/" + this.getPropNameFromFQP(model.type) + ".js"
      );
    }

    return "/oa/models/" + this.getPropNameFromFQP(model.type) + ".js";
  }

  getEnumFilename(thisEnum) {
    if (this.includedInSchema(thisEnum.enumType)) {
      return (
        "/schema/enums/" + this.getPropNameFromFQP(thisEnum.enumType) + ".js"
      );
    }

    return "/oa/enums/" + this.getPropNameFromFQP(thisEnum.enumType) + ".js";
  }

  convertToClassName(value) {
    // 3DModel is an invalid class name..
    value = value.replace(/^3/, "Three");

    return this.convertToCamelCase(value);
  }

  convertToFilename(value) {
    return value;
  }

  getLangType(fullyQualifiedType, isExtension, field) {
    let baseType = this.getValidationBaseType(
      fullyQualifiedType,
      isExtension,
      field
    );
    if (this.isArray(fullyQualifiedType)) {
      return `s.array(${baseType})`;
    } else {
      return baseType;
    }
  }

  getValidationBaseType(prefixedTypeName, isExtension, model) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "s.boolean";
      case "Date": // TODO: Find better way of representing Date
        return "s.string";
      case "DateTime":
        return "s.isoDateTimeString";
      case "Time":
        return "s.string";
      case "Integer":
        return "s.nonNegativeInt";
      case "Float":
        return "s.nonNegativeFloat";
      case "Number":
        return "s.nonNegativeFloat";
      case "Text":
        return "s.string";
      case "Duration":
        return "s.string";
      case "Property":
        return `oa.enums.${this.propertyEnumerationName}`;
      case "URL":
        return "s.urlString";
      case "null":
        return "s.null";
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return "schema.enums." + this.convertToCamelCase(typeName);
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              "schema.enums." + this.convertToCamelCase(typeName)
            );
          }
          return "oa.enums." + this.convertToCamelCase(typeName);
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return "oa." + this.convertToCamelCase(typeName);
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              "schema." + this.convertToCamelCase(typeName)
            );
          }
          return "oa." + this.convertToCamelCase(typeName);
        } else if (/^schema:/.test(model.memberName)) {
          console.info(
            `**** property ${model.memberName} referenced non-existent type ${compactedTypeName}. This is normal. See https://schema.org/docs/extension.html for details.`
          );
          return; // nothing to return here
        } else {
          throw new Error(
            "Unrecognised type or enum referenced: " +
              typeName +
              ", " +
              compactedTypeName
          );
        }
    }
  }

  renderCode(code, fieldName, requiredType) {
    if (typeof code === "object") {
      return (
        "```json\n" +
        (fieldName ? `"` + fieldName + `": ` : "") +
        JSON.stringify(code, null, 2) +
        "\n```"
      );
    } else {
      let isNumber =
        requiredType &&
        (requiredType.indexOf("Integer") > -1 ||
          requiredType.indexOf("Float") > -1);
      return (
        "```json\n" +
        (fieldName ? `"` + fieldName + `": ` : "") +
        (isNumber ? code : `"` + code + `"`) +
        "\n```"
      );
    }
  }

  createPropertyFromField(field, models, enumMap, hasBaseClass, model) {
    let memberName = field.memberName || field.fieldName;
    let isExtension = !!field.extensionPrefix;
    let isNew = field.derivedFromSchema; // Only need new if sameAs specified as it will be replacing a schema.org type
    let propertyName = this.convertToCamelCase(field.fieldName);
    let propertyType = this.createLangTypeString(field, isExtension);

    if (["oa", "schema"].includes(this.getPrefix(memberName))) {
      memberName = this.getPropNameFromFQP(memberName);
    }

    let obj = {
      memberName: memberName,
      propName: field.fieldName,
      description: this.createDescription(field),
      codeExample: this.createCodeExample(field),
      propertyType: propertyType,
    };

    if (field.disinherit) {
      return {
        ...obj
      };
    } else {
      return {
        ...obj
      };
    }
  }

  createLangTypeString(field, isExtension) {
    const types = this.createTypesArray(field, isExtension);
    
    if (types.length === 0) return null;
    if (types.length === 1) return types[0];
    
    return `s.union([${types.join(",")}])`
  }

  createTypesArray(field, isExtension) {
    let types = []
      .concat(field.alternativeTypes)
      .concat(field.requiredType)
      .concat(field.alternativeModels)
      .concat(field.model)
      .concat(field.allowReferencing ? ['https://schema.org/URL'] : [])
      .filter(type => type !== undefined);

    // We get the types from given schema/OA ones,
    // and filter out duplicated types
    types = types
      .map(fullyQualifiedType =>
        this.getLangType(fullyQualifiedType, isExtension, field)
      )
      .filter(a => !!a)
      .filter((val, idx, self) => self.indexOf(val) === idx);

    if (types.length == 0) {
      if (/^schema:/.test(field.memberName)) {
        console.warn(
          `*** ${field.memberName} field has 0 valid types (however this is kind of expected for schema).`
        );
      } else {
        throw new Error("No type found for field: " + field.fieldName);
      }
    }

    return types;
  }

  calculateInherits(subClassOf, derivedFrom, model) {
    // Prioritise subClassOf over derivedFrom
    if (subClassOf) {
      let subClassOfName = this.convertToCamelCase(
        this.getPropNameFromFQP(subClassOf)
      );

      if (this.includedInSchema(subClassOf)) {
        return `::OpenActive::Models::Schema::${subClassOfName}`;
      }

      if (this.includedInSchema(model.type)) {
        // If type is from schema.org, we override schema.org
        return `::OpenActive::Models::Schema::${subClassOfName}`;
      }

      return `::OpenActive::Models::${subClassOfName}`;
    }

    if (derivedFrom) {
      let derivedFromName = this.convertToCamelCase(
        this.getPropNameFromFQP(derivedFrom)
      );

      if (this.includedInSchema(derivedFrom)) {
        return `::OpenActive::Models::Schema::${derivedFromName}`;
      }

      if (this.includedInSchema(model.type)) {
        // If type is from schema.org, we override schema.org
        return `::OpenActive::Models::Schema::${derivedFromName}`;
      }

      // Note if derived from is outside of schema.org there won't be a base class, but it will still be JSON-LD
      return `::OpenActive::JsonLdModel`;
    }

    // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
    // throw new Error("No base class specified for: " + model.type);
    return `::OpenActive::JsonLdModel`;
  }
}

module.exports = TypeScript;

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

  // async renderIndex(data) {
  //   this.indexTemplate =
  //     this.indexTemplate ||
  //     (await this.loadTemplate(__dirname + "/index.ts.mustache"));

  //   return this.indexTemplate(data);
  // }

  async renderEnumsIndex(data) {
    this.enumsIndexTemplate =
      this.enumsIndexTemplate ||
      (await this.loadTemplate(__dirname + "/enums-index.ts.mustache"));

    return this.enumsIndexTemplate(data);
  }

  async renderModelsIndex(data) {
    this.modelsIndexTemplate =
      this.modelsIndexTemplate ||
      (await this.loadTemplate(__dirname + "/models-index.ts.mustache"));

    return this.modelsIndexTemplate(data);
  }

  async renderModel(data) {
    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.ts.mustache"));

    return this.modelTemplate(data);
  }

  // doIncludeEmptyEnums() {
  //   /* TypeScript does not support empty unions (though this is equivalent to `never`, it would be confusing to
  //   generate enums whose type was `never` and whose validation functions always returned false) */
  //   return false;
  // }

  async renderEnum(data) {
    this.enumTemplate = this.enumTemplate || {
      main: await this.loadTemplate(__dirname + "/enum.ts.mustache")
    };

    let response = {
      [this.getEnumFilename(data)]: this.enumTemplate.main(data)
    };

    return response;
  }

  // TODO: Refactor this to remove string hacks, it is currently dependent on the strings in
  // getDirs, getModelFilename and getEnumFilename
  async createIndexFiles() {
    /**
     * @param {string[]} filePaths
     * @param {RegExp} matchFileRegex A regex which 1). matches files that we're concerned with and 2). captures the
     *   name of the model/enum from the file path in its FIRST capture group.
     */
    const getRequireList = (filePaths, matchFileRegex) => {
      const list = [];
      for (const filePath of filePaths) {
        const match = matchFileRegex.exec(filePath);
        if (match) {
          const typeName = match[1];
        // }
        // if (filePath.indexOf(prefix) === 0) {
        //   const typeName = filePath.substring(prefix.length, filePath.length - '.ts'.length);
          list.push({
            typeSymbolName: this.convertToClassName(typeName),
            typeName,
          });
        }
      }
      return list;
    };
    /**
     * @param {string[]} files
     * @param {RegExp} modelRegex
     */
    const getData = (files, matchFileRegex) => {
      return {
        types: getRequireList(files, matchFileRegex),
      };
    };
    return {
      "/oa/enums/index.ts": await this.renderEnumsIndex(getData(this.generatedFiles, new RegExp("^/oa/enums/([^/]+).ts$"))),
      "/oa/index.ts": await this.renderModelsIndex(getData(this.generatedFiles, new RegExp("^/oa/([^/]+).ts$"))),
      "/schema/enums/index.ts": await this.renderEnumsIndex(getData(this.generatedFiles, new RegExp("^/schema/enums/([^/]+).ts$"))),
      "/schema/index.ts": await this.renderModelsIndex(getData(this.generatedFiles, new RegExp("^/schema/([^/]+).ts$"))),
    };
  }

  getDirs() {
    return ["schema/", "oa/"];
  }

  getModelFilename(model) {
    if (this.includedInSchema(model.type)) {
      return (
        "/schema/" + this.getPropNameFromFQP(model.type) + ".ts"
      );
    }

    return "/oa/" + this.getPropNameFromFQP(model.type) + ".ts";
  }

  getEnumFilename(thisEnum) {
    if (this.includedInSchema(thisEnum.enumType)) {
      return (
        "/schema/enums/" + this.getPropNameFromFQP(thisEnum.enumType) + ".ts"
      );
    }

    return "/oa/enums/" + this.getPropNameFromFQP(thisEnum.enumType) + ".ts";
  }

  convertToClassName(value) {
    // 3DModel is an invalid class name..
    value = value.replace(/^3/, "Three");

    return this.convertToCamelCase(value);
  }

  convertToFilename(value) {
    return value;
  }

  getTsType(fullyQualifiedType, isExtension, field) {
    const baseType = this.getTsBaseType(
      fullyQualifiedType,
      isExtension,
      field
    );
    if (this.isArray(fullyQualifiedType)) {
      return `${baseType}[]`;
      // return `s.array(${baseType})`;
    } else {
      return baseType;
    }
  }

  getTsBaseType(prefixedTypeName, isExtension, model) {
    const typeName = this.getPropNameFromFQP(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "boolean";
      case "Date":
        return "string";
      case "DateTime":
        return "string";
      case "Time":
        return "string";
      case "Integer":
        return "number";
      case "Float":
        return "number";
      case "Number":
        return "number";
      case "Text":
        return "string";
      case "Duration":
        return "string";
      case "Property":
        return `oa.enums.${this.propertyEnumerationName}.Type`;
      case "URL":
        return "string";
      case "null":
        return "null";
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return `oa.enums.${this.convertToCamelCase(typeName)}.Type`;
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              `schema.enums.${this.convertToCamelCase(typeName)}.Type`
            );
          }
          return `oa.enums.${this.convertToCamelCase(typeName)}.Type`;
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return `oa.${this.convertToCamelCase(typeName)}.Type`;
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              `schema.${this.convertToCamelCase(typeName)}.Type`
            );
          }
          return `oa.${this.convertToCamelCase(typeName)}.Type`;
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

  /**
   * @param {string} fullyQualifiedType
   * @param {string} rootModelPrefixedTypeName
   */
  getJoiType(fullyQualifiedType, isExtension, field, rootModelPrefixedTypeName) {
    const baseType = this.getJoiBaseType(
      fullyQualifiedType,
      isExtension,
      field,
      rootModelPrefixedTypeName,
    );
    if (this.isArray(fullyQualifiedType)) {
      return `Joi.array().items(${baseType})`;
    } else {
      return baseType;
    }
  }

  /**
   * @param {string} prefixedTypeName
   * @param {string} rootModelPrefixedTypeName Type of the root model e.g. `schema:Enumeration`
   *   If this is getting the Joi base type for, say, the `ageRange` property within `Event`, the model itself
   *   would be QuantitativeValue (for `ageRange`), and the rootModel would be `Event`.
   */
  getJoiBaseType(prefixedTypeName, isExtension, model, rootModelPrefixedTypeName) {
    // if (prefixedTypeName === rootModelPrefixedTypeName) {
    // }
    const typeName = this.getPropNameFromFQP(prefixedTypeName);
    if (typeName === this.getPropNameFromFQP(rootModelPrefixedTypeName)) {
      /* Make this an absolute link to the root model. Joi models cannot be built recursively in the normal manner
      otherwise you'll develop a situation akin to `const x = { field: x };` which has no clear value */
      return "Joi.link('/')";
    }
    switch (typeName) {
      case "Boolean":
        return "Joi.boolean()";
      case "Date":
        return "Joi.string().isoDate()";
      case "DateTime":
        return "Joi.string().isoDate()";
      case "Time":
        return "Joi.string()";
      case "Integer":
        return "Joi.number().integer()";
      case "Float":
        return "Joi.number()";
      case "Number":
        return "Joi.number()";
      case "Text":
        return "Joi.string()";
      case "Duration":
        return "Joi.string().isoDuration()";
      case "Property":
        return `oa.enums.${this.propertyEnumerationName}.JoiSchema`;
      case "URL":
        return "Joi.string().uri()";
      case "null":
        return "null"; // TODO what is this? This will create an erroneous Joi Schema if exercised, but I have not seen it exercised at all - LW.
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return `oa.enums.${this.convertToCamelCase(typeName)}.JoiSchema`;
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              `schema.enums.${this.convertToCamelCase(typeName)}.JoiSchema`
            );
          }
          return `oa.enums.${this.convertToCamelCase(typeName)}.JoiSchema`;
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return `oa.${this.convertToCamelCase(typeName)}.JoiSchema`;
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              `schema.${this.convertToCamelCase(typeName)}.JoiSchema`
            );
          }
          return `oa.${this.convertToCamelCase(typeName)}.JoiSchema`;
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
    const isExtension = !!field.extensionPrefix;
    const isNew = field.derivedFromSchema; // Only need new if sameAs specified as it will be replacing a schema.org type
    const propertyName = this.convertToCamelCase(field.fieldName);
    const propertyTsType = this.createTsTypeString(field, isExtension);
    // model.type is e.g. schema:Enumeration
    const propertyJoiType = this.createJoiTypeString(field, isExtension, model.type);

    if (["oa", "schema"].includes(this.getPrefix(memberName))) {
      memberName = this.getPropNameFromFQP(memberName);
    }

    const obj = {
      memberName: memberName,
      propName: field.fieldName,
      description: this.createDescription(field),
      codeExample: this.createCodeExample(field),
      propertyTsType,
      propertyJoiType,
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

  /**
   * For a list of types (which have alredy been converted to strings), combine them in some way.
   *
   * If there's only one type, it is just returned as-is.
   * If there are multiple, then they are combined in some way
   *
   * @param {(types: string[]) => string} combineMultiples
   * @param {string[]} types
   */
  static combineTypes(combineMultiples, types) {
    if (types.length === 0) return null;
    if (types.length === 1) return types[0];
    
    return combineMultiples(types);
  }

  createTsTypeString(field, isExtension) {
    const typesArray = this.createTsTypesArray(field, isExtension);
    return TypeScript.combineTypes(types => types.join(' | '), typesArray);
  }

  /**
   * The returned array represents a union of possible types
   */
  createTsTypesArray(field, isExtension) {
    return TypeScript.createGenericTypesArray(this.getTsType.bind(this), field, isExtension);
  }

  /**
   * @param {string} rootModelPrefixedTypeName
   */
  createJoiTypeString(field, isExtension, rootModelPrefixedTypeName) {
    const typesArray = this.createJoiTypesArray(field, isExtension, rootModelPrefixedTypeName);
    return TypeScript.combineTypes(types => `Joi.alternatives().try(${types.join(', ')})`, typesArray);
  }

  /**
   * The returned array represents a union of possible types
   *
   * @param {string} rootModelPrefixedTypeName
   */
  createJoiTypesArray(field, isExtension, rootModelPrefixedTypeName) {
    return TypeScript.createGenericTypesArray(this.getJoiType.bind(this), field, isExtension, rootModelPrefixedTypeName);
  }

  /**
   * @param {(fullyQualifieidType: string, isExtension: any, field: any, rootModelPrefixedTypeName: string) => string} getTypeFn
   * @returns {string[]}
   */
  static createGenericTypesArray(getTypeFn, field, isExtension, rootModelPrefixedTypeName) {
    const types = []
      .concat(field.alternativeTypes)
      .concat(field.requiredType)
      .concat(field.alternativeModels)
      .concat(field.model)
      .concat(field.allowReferencing ? ['https://schema.org/URL'] : [])
      .filter(type => type !== undefined)
      // We get the types from given schema/OA ones,
      // and filter out duplicated types
      .map(fullyQualifiedType =>
        getTypeFn(fullyQualifiedType, isExtension, field, rootModelPrefixedTypeName)
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

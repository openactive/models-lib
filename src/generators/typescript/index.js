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

  setupHandlebars() {
    Handlebars.registerHelper("renderPropName", function() {
      return new Handlebars.SafeString(/^[A-Za-z0-9]*$/.test(this.propName) ? this.propName : `'${this.propName}'`);
    });
  }

  async renderIndex(data) {
    this.indexTemplate =
      this.indexTemplate ||
      (await this.loadTemplate(__dirname + "/index.ts.mustache"));

    return this.indexTemplate(data);
  }

  /**
   * @param {string} typeName
   */
  filterModel(typeName, model) {
    /* EventStatusType is erroneously made into a model as well as an enum. Because the TS generator puts enums and
    models into the same directory, this causes issues */
    if (typeName === 'schema:EventStatusType') {
      return false;
    }
    return true;
  }

  async renderModel(data) {
    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.ts.mustache"));

    return this.modelTemplate(data);
  }

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
      "/oa/index.ts": await this.renderIndex(getData(this.generatedFiles, new RegExp("^/oa/([^/]+).ts$"))),
      "/schema/index.ts": await this.renderIndex(getData(this.generatedFiles, new RegExp("^/schema/([^/]+).ts$"))),
    };
  }

  getDirs() {
    return ["schema/", "oa/"];
  }

  /**
   * @param {string} type
   */
  genericGetFilename(type) {
    if (this.includedInSchema(type)) {
      return (
        "/schema/" + this.getPropNameFromFQP(type) + ".ts"
      );
    }

    return "/oa/" + this.getPropNameFromFQP(type) + ".ts";
  }

  getModelFilename(model) {
    return this.genericGetFilename(model.type);
  }

  getEnumFilename(thisEnum) {
    return this.genericGetFilename(thisEnum.enumType);
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
    } else {
      return baseType;
    }
  }

  /**
   * @param {'oa' | 'schema'} oaOrSchema
   * @param {string} modelOrEnumTypeName
   */
  getTsBaseTypeForModelOrEnum(oaOrSchema, modelOrEnumTypeName) {
    return `${oaOrSchema}.${this.convertToCamelCase(modelOrEnumTypeName)}.OrSubClassType`;
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
        return /*`oa.${this.propertyEnumerationName}.Type`*/this.getTsBaseTypeForModelOrEnum('oa', this.propertyEnumerationName);
      case "URL":
        return "string";
      case "null":
        return "null";
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return /*`oa.${this.convertToCamelCase(typeName)}.Type`*/this.getTsBaseTypeForModelOrEnum('oa', typeName);
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              /*`schema.${this.convertToCamelCase(typeName)}.Type`*/this.getTsBaseTypeForModelOrEnum('schema', typeName)
            );
          }
          return /*`oa.${this.convertToCamelCase(typeName)}.Type`*/this.getTsBaseTypeForModelOrEnum('oa', typeName);
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return /*`oa.${this.convertToCamelCase(typeName)}.Type`*/this.getTsBaseTypeForModelOrEnum('oa', typeName);
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              /*`schema.${this.convertToCamelCase(typeName)}.Type`*/this.getTsBaseTypeForModelOrEnum('schema', typeName)
            );
          }
          return /*`oa.${this.convertToCamelCase(typeName)}.Type`*/this.getTsBaseTypeForModelOrEnum('oa', typeName);
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

  // /**
  //  * @param {string} joiSchemaSymbol e.g. `oa.Property.JoiSchema`
  //  */
  // static joiLazyLink(joiSchemaSymbol) {
  //   /* Joi Schemas must be linked to lazily because there is a lot of mutual recursion (e.g. Enumeration refers to
  //   Concept and vice versa) they cannot always directly reference each other */
  //   return `Joi.lazy(() => ${joiSchemaSymbol})`;
  // }

  // /* e.g. An Event has `.subEvent`, which can be an Event. This means that it could also be a SessionSeries,
  // ScheduledSession, etc.. for all of the Event sub-classes.
  // If we just generate `subEvent: Event.JoiSchema`, this will not allow a ScheduledSession to be used.
  // As we are using TypeScript's structural typing, this is best achieved by allowing for Event `.subEvent` to be
  // either an Event or a SessionSeries or [etc..] */

  /**
   * @param {'oa' | 'schema'} oaOrSchema
   * @param {string} modelOrEnumTypeName
   */
  getJoiBaseTypeForModelOrEnum(oaOrSchema, modelOrEnumTypeName) {
    /* Joi Schemas must be linked to lazily because there is a lot of mutual recursion (e.g. Enumeration refers to
    Concept and vice versa) they cannot always directly reference each other */
    return `Joi.lazy(() => ${oaOrSchema}.${this.convertToCamelCase(modelOrEnumTypeName)}.OrSubClassJoiSchema)`;
  }

  /**
   * @param {string} prefixedTypeName
   * @param {string} rootModelPrefixedTypeName Type of the root model e.g. `schema:Enumeration`
   *   If this is getting the Joi base type for, say, the `ageRange` property within `Event`, the model itself
   *   would be QuantitativeValue (for `ageRange`), and the rootModel would be `Event`.
   */
  getJoiBaseType(prefixedTypeName, isExtension, model, rootModelPrefixedTypeName) {
    const typeName = this.getPropNameFromFQP(prefixedTypeName);
    // /* Joi Schemas must be linked to lazily because there is a lot of mutual recursion (e.g. Enumeration refers to
    // Concept and vice versa) they cannot always directly reference each other */
    // const lazy = (schemaSymbol) => `Joi.lazy(() => ${schemaSymbol})`;
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
        return "Joi.string()"; // The below can be we used if Joi is upgraded to v17
        // return "Joi.string().isoDuration()";
      case "Property":
        return this.getJoiBaseTypeForModelOrEnum('oa', this.propertyEnumerationName);
        // return lazy(`oa.${this.propertyEnumerationName}.JoiSchema`);
      case "URL":
        return "Joi.string().uri()";
      case "null":
        /* TODO what does it mean for this to be null? This will create an erroneous Joi Schema if exercised, but I
        have not seen it exercised at all - LW. */
        throw new Error('An explicit `null` cannot be specified in JOI');
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return /*lazy(`oa.${this.convertToCamelCase(typeName)}.JoiSchema`) */this.getJoiBaseTypeForModelOrEnum('oa', typeName);
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              /*lazy(`schema.${this.convertToCamelCase(typeName)}.JoiSchema`) */this.getJoiBaseTypeForModelOrEnum('schema', typeName)
            );
          }
          return /*lazy(`oa.${this.convertToCamelCase(typeName)}.JoiSchema`) */this.getJoiBaseTypeForModelOrEnum('oa', typeName);
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return /*lazy(`oa.${this.convertToCamelCase(typeName)}.JoiSchema`) */this.getJoiBaseTypeForModelOrEnum('oa', typeName);
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              /*lazy(`schema.${this.convertToCamelCase(typeName)}.JoiSchema`) */this.getJoiBaseTypeForModelOrEnum('schema', typeName)
            );
          }
          return /*lazy(`oa.${this.convertToCamelCase(typeName)}.JoiSchema`) */this.getJoiBaseTypeForModelOrEnum('oa', typeName);
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
   * @param {import('../../generator').Model} subClassModel
   */
  createSubClassListEntry(subClassModel) {
    const oaOrSchema = subClassModel.extension === 'schema' ? 'schema' : 'oa';
    return {
      subClassTsType: this.getTsBaseTypeForModelOrEnum(oaOrSchema, subClassModel.type),
      subClassJoiType: this.getJoiBaseTypeForModelOrEnum(oaOrSchema, subClassModel.type),
    };
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

  // calculateInherits(subClassOf, derivedFrom, model) {
  //   return null;
    // // Prioritise subClassOf over derivedFrom
    // if (subClassOf) {
    //   let subClassOfName = this.convertToCamelCase(
    //     this.getPropNameFromFQP(subClassOf)
    //   );

    //   if (this.includedInSchema(subClassOf)) {
    //     return `::OpenActive::Models::Schema::${subClassOfName}`;
    //   }

    //   if (this.includedInSchema(model.type)) {
    //     // If type is from schema.org, we override schema.org
    //     return `::OpenActive::Models::Schema::${subClassOfName}`;
    //   }

    //   return `::OpenActive::Models::${subClassOfName}`;
    // }

    // if (derivedFrom) {
    //   let derivedFromName = this.convertToCamelCase(
    //     this.getPropNameFromFQP(derivedFrom)
    //   );

    //   if (this.includedInSchema(derivedFrom)) {
    //     return `::OpenActive::Models::Schema::${derivedFromName}`;
    //   }

    //   if (this.includedInSchema(model.type)) {
    //     // If type is from schema.org, we override schema.org
    //     return `::OpenActive::Models::Schema::${derivedFromName}`;
    //   }

    //   // Note if derived from is outside of schema.org there won't be a base class, but it will still be JSON-LD
    //   return `::OpenActive::JsonLdModel`;
    // }

    // // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
    // // throw new Error("No base class specified for: " + model.type);
    // return `::OpenActive::JsonLdModel`;
  // }
}

module.exports = TypeScript;

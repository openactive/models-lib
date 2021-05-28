const { getExamplesWithContent } = require('@openactive/data-models');
const path = require('path');
const Generator = require('../../generator');
const Handlebars = require('handlebars');
const { throwError } = require('../../utils/throw');

/**
 * @typedef {import('../../generator').Model} Model
 * @typedef {import('../../generator').PageContent} PageContent
 */

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

  setupHandlebars() {
    Handlebars.registerHelper("renderMemberName", function() {
      return new Handlebars.SafeString(/^[A-Za-z0-9]*$/.test(this.memberName) ? this.memberName : `'${this.memberName}'`);
    });
  }

  async renderIndex(data) {
    this.indexTemplate =
      this.indexTemplate ||
      (await this.loadTemplate(__dirname + "/index.ts.mustache"));

    return this.indexTemplate(data);
  }

  async renderDataModelExampleTest(data) {
    this.dataModelExampleTestTemplate =
      this.dataModelExampleTestTemplate ||
      (await this.loadTemplate(__dirname + "/data-models-example-test.ts.mustache"));
    
    return this.dataModelExampleTestTemplate(data);
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

  /**
   * Use the example data-models to contrive tests which ensure that TS types and JOI schema
   * pass for these examples.
   *
   * @returns {Promise<PageContent>}
   */
  async createTestFiles() {
    const examples = await getExamplesWithContent("2.0");
    /** @type {PageContent} */
    const result = {};
    for (const example of examples) {
      // sessionseries_example_1.json -> sessionseries_example_1
      const exampleFileBaseName = path.basename(example.file, ".json");
      const exampleFilePath = `/test/data-models-examples/${exampleFileBaseName}.spec.ts`;
      if (exampleFilePath in result) {
        throw new Error(`There are multiple data models example files with the same name, "${exampleFileBaseName}" ("${example.file}")`);
      }
      const model = example.data?.items?.[0]?.data
        ?? example.data;
      const modelType = model["@type"]
        ?? throwError(`No @type found in data-models example file "${example.file}"`);
      const modelSymbolName = this.convertToClassName(modelType);
      result[exampleFilePath] = await this.renderDataModelExampleTest({
        exampleFileName: example.file,
        modelSymbolName,
        exampleObject: JSON.stringify(model, null, 2),
      });
    }
    return result;
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
      return `/schema/${this.getPropNameFromFQP(type)}.ts`;
    }

    return `/oa/${this.getPropNameFromFQP(type)}.ts`;
  }

  getModelFilename(model) {
    return this.genericGetFilename(model.type);
  }

  getEnumFilename(thisEnum) {
    return this.genericGetFilename(thisEnum.enumType);
  }

  /**
   * @param {string} value
   */
  convertToClassName(value) {
    // A special case is made for `Event`, which is a reserved type in TypeScript.
    if (value === 'Event') { return 'Eventt'; }
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
   * @param {'model' | 'enum'} modelOrEnum
   */
  getTsBaseTypeForModelOrEnum(oaOrSchema, modelOrEnumTypeName, modelOrEnum) {
    // Schema.org types are in the schema. namespace
    const prefix = `${oaOrSchema}.`;
    const baseName = this.convertToClassName(modelOrEnumTypeName);
    // enums don't have OrSubClassType as there is (as of yet!) no sub-class logic for enums in models-lib.
    const suffix = modelOrEnum === 'model' ? 'OrSubClass' : '';
    return `${prefix}${baseName}${suffix}`;
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
        return this.getTsBaseTypeForModelOrEnum('oa', this.propertyEnumerationName, 'enum');
      case "URL":
        return "string";
      case "null":
        return "null";
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return this.getTsBaseTypeForModelOrEnum('oa', typeName, 'enum');
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              this.getTsBaseTypeForModelOrEnum('schema', typeName, 'enum')
            );
          }
          return this.getTsBaseTypeForModelOrEnum('oa', typeName, 'enum');
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return this.getTsBaseTypeForModelOrEnum('oa', typeName, 'model');
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              this.getTsBaseTypeForModelOrEnum('schema', typeName, 'model')
            );
          }
          return this.getTsBaseTypeForModelOrEnum('oa', typeName, 'model');
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
   * @param {'oa' | 'schema'} oaOrSchema
   * @param {string} modelOrEnumTypeName Type name of the model/enum
   * @param {'model' | 'enum'} modelOrEnum
   */
  getJoiBaseTypeForModelOrEnum(oaOrSchema, modelOrEnumTypeName, modelOrEnum) {
    // Schema.org types are in the schema. namespace
    const prefix = `${oaOrSchema}.`;
    const baseName = this.convertToClassName(modelOrEnumTypeName);
    // enums don't have OrSubClassJoiSchema as there is (as of yet!) no sub-class logic for enums in models-lib.
    const suffix = modelOrEnum === 'model' ? 'OrSubClassJoiSchema' : 'JoiSchema';
    /* Joi Schemas must be linked to lazily because there is a lot of mutual recursion (e.g. Enumeration refers to
    Concept and vice versa) they cannot always directly reference each other */
    return `Joi.lazy(() => ${prefix}${baseName}${suffix})`;
  }

  /**
   * @param {string} prefixedTypeName
   * @param {string} rootModelPrefixedTypeName Type of the root model e.g. `schema:Enumeration`
   *   If this is getting the Joi base type for, say, the `ageRange` property within `Event`, the model itself
   *   would be QuantitativeValue (for `ageRange`), and the rootModel would be `Event`.
   */
  getJoiBaseType(prefixedTypeName, isExtension, model, rootModelPrefixedTypeName) {
    const typeName = this.getPropNameFromFQP(prefixedTypeName);
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
        return this.getJoiBaseTypeForModelOrEnum('oa', this.propertyEnumerationName, 'enum');
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
          return this.getJoiBaseTypeForModelOrEnum('oa', typeName, 'enum');
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              this.getJoiBaseTypeForModelOrEnum('schema', typeName, 'enum')
            );
          }
          return this.getJoiBaseTypeForModelOrEnum('oa', typeName, 'enum');
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return this.getJoiBaseTypeForModelOrEnum('oa', typeName, 'model');
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              this.getJoiBaseTypeForModelOrEnum('schema', typeName, 'model')
            );
          }
          return this.getJoiBaseTypeForModelOrEnum('oa', typeName, 'model');
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

    if (model.type === 'CourseInstance' && field.memberName === 'beta:course') {
      console.log('hmmm');
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
   * @param {Model} subClassModel
   */
  createSubClassListEntry(subClassModel) {
    const oaOrSchema = subClassModel.extension === 'schema' ? 'schema' : 'oa';
    const subClassModelTypeName = this.convertToClassName(this.getPropNameFromFQP(subClassModel.type));
    return {
      subClassTsType: this.getTsBaseTypeForModelOrEnum(oaOrSchema, subClassModelTypeName, 'model'),
      subClassJoiType: this.getJoiBaseTypeForModelOrEnum(oaOrSchema, subClassModelTypeName, 'model'),
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

}

module.exports = TypeScript;

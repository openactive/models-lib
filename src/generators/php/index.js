import Generator from "../../generator";
import Handlebars from "handlebars";

const DATA_MODEL_DOCS_URL_PREFIX =
  "https://developer.openactive.io/data-model/types/";

class PHP extends Generator {
  mutateExtensions(extensions) {
    return {
      ...require("../../extensions/_schema.json"),
      ...extensions
    };
  }

  // using inplace of standard namespace
  getBasicNamespace(prop) {
    if (this.includedInSchema(prop)) {
      return ["SchemaOrg"];
    }
    return [];
  }

  async renderModel(data) {
    const includedInSchema = this.includedInSchema(data.modelType);

    if (!includedInSchema) {
      data["subNamespaceText"] = "\\OA";
    } else {
      data["subNamespaceText"] = "\\SchemaOrg";
    }

    let that = this;
    Handlebars.registerHelper("pascalCasePropName", function() {
      return new Handlebars.SafeString(that.convertToCamelCase(this.propName));
    });

    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.php.mustache"));

    return this.modelTemplate(data);
  }

  async renderEnum(data) {
    const includedInSchema = this.includedInSchema(data.enumType);

    if (!includedInSchema) {
      data["subNamespaceText"] = "";
    } else {
      data["subNamespaceText"] = "\\SchemaOrg";
    }

    this.enumTemplate = this.enumTemplate || {
      main: await this.loadTemplate(__dirname + "/enum_main.php.mustache"),
      sub: await this.loadTemplate(__dirname + "/enum_sub.php.mustache")
    };

    let response = {
      [this.getEnumFilename(data)]: this.enumTemplate.main(data)
    };

    for (let value of data.values) {
      let filename = this.getEnumFilename(data, value.value);
      response[filename] = this.enumTemplate.sub({ ...data, ...value });
    }

    return response;
  }

  getDirs() {
    return ["Models/", "Models/SchemaOrg/", "Models/OA/", "Enums/"];
  }

  getModelFilename(model) {
    if (this.includedInSchema(model.type)) {
      return (
        "/Models/SchemaOrg/" + this.getPropNameFromFQP(model.type) + ".php"
      );
    }

    return "/Models/OA/" + this.getPropNameFromFQP(model.type) + ".php";
  }

  getEnumFilename(thisEnum, val) {
    let parts = [
      "Enums",
      ...this.getBasicNamespace(thisEnum.enumType),
      this.getPropNameFromFQP(thisEnum.enumType),
      val
    ];

    parts = parts.filter(val => !!val);

    return "/" + parts.join("/") + ".php";
  }

  convertToClassName(value) {
    // 3DModel is an invalid class name..
    value = value.replace(/^3/, "Three");

    return this.convertToCamelCase(value);
  }

  convertToFilename(value) {
    return value;
  }

  validationTypeToLangType(validationType) {
    if (validationType === "Time") {
      return "string";
    }
    if (validationType === "Time[]") {
      return "string[]";
    }
    return validationType;
  }

  getValidationType(fullyQualifiedType, isExtension, field) {
    let baseType = this.getValidationBaseType(
      fullyQualifiedType,
      isExtension,
      field
    );
    if (this.isArray(fullyQualifiedType)) {
      // Remove "|null" from end of type if it's an array
      if (baseType.slice(-5) === "|null") {
        return `${baseType.slice(0, -5)}[]`;
      } else {
        return `${baseType}[]`;
      }
    } else {
      return baseType;
    }
  }

  getValidationBaseType(prefixedTypeName, isExtension, model) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    let compactedTypeName = this.getCompacted(prefixedTypeName);
    let extension = this.extensions[model.extensionPrefix];
    switch (typeName) {
      case "Boolean":
        return "bool";
      case "Date":
        return "Date";
      case "DateTime":
        return "DateTime";
      case "Time":
        return "Time";
      case "Integer":
        return "int";
      case "Float":
      case "Number":
        return "float";
      case "Property":
      case "Text":
      case "URL":
        return "string";
      case "Duration":
        return "DateInterval";
      case "null":
        return "null";
      default:
        let camelName = this.convertToCamelCase(typeName);
        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return "\\OpenActive\\Enums\\" + camelName;
        } else if (this.enumMap[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return "\\OpenActive\\Enums\\SchemaOrg\\" + camelName;
          }
          return "\\OpenActive\\Enums\\" + camelName;
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return "\\OpenActive\\Models\\" + camelName;
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return "\\OpenActive\\Models\\SchemaOrg\\" + camelName;
          }
          return "\\OpenActive\\Models\\OA\\" + camelName;
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

  isTypeNullable(prefixedTypeName, isExtension) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    let compactedTypeName = this.getCompacted(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
      case "Date":
      case "DateTime":
      case "Duration":
      case "Float":
      case "Integer":
      case "Number":
      case "Time":
        return true;
      case "Property":
      case "Text":
      case "URL":
        return false;
      default:
        if (this.enumMap[typeName]) {
          return true;
        } else if (this.enumMap[compactedTypeName]) {
          return true;
        } else if (this.models[typeName]) {
          return false;
        } else if (isExtension) {
          // Extensions may reference schema.org, for which we have no reference here to confirm
          return false;
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

  createPropertyFromField(field, models, enumMap, hasBaseClass) {
    let memberName = field.memberName || field.fieldName;
    let isExtension = !!field.extensionPrefix;
    let isNew = field.derivedFromSchema; // Only need new if sameAs specified as it will be replacing a schema.org type
    let propertyName = this.convertToCamelCase(field.fieldName);
    let propertyType = this.createLangTypeString(field, isExtension);
    let propertyTypes = this.createValidationTypesArray(field, isExtension);

    if (["oa", "schema"].includes(this.getPrefix(memberName))) {
      memberName = this.getPropNameFromFQP(memberName);
    }

    let obj = {
      memberName: memberName,
      propName: field.fieldName,
      description: this.createDescription(field),
      codeExample: this.createCodeExample(field),
      propertyType: propertyType,
      propertyTypes: propertyTypes
    };

    if (field.obsolete) {
      return {
        ...obj,
        isObsolete: true
      };
    } else {
      let methodType = "";
      if (!isExtension && hasBaseClass && (isNew || field.override)) {
        methodType = "new ";
      }

      let order = field.order;
      if (isExtension) {
        order += 1000;
      }

      return {
        ...obj
      };
    }
  }

  createLangTypeString(field, isExtension) {
    const validationTypes = this.createValidationTypesArray(field, isExtension);

    const types = validationTypes.map(type =>
      this.validationTypeToLangType(type)
    );

    // OpenActive SingleValues not allow many of the same type, only allows one
    return types.length > 1 ? `${types.join("|")}` : types[0];
  }

  validationTypeWeight(prefixedTypeName, isExtension, model) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    let compactedTypeName = this.getCompacted(prefixedTypeName);
    let extension = this.extensions[model.extensionPrefix];
    switch (typeName) {
      case "Boolean":
        return 0;
      case "Date":
        return 1;
      case "DateTime":
        return 2;
      case "Time":
        return 3;
      case "Integer":
        return 7;
      case "Float":
      case "Number":
        return 6;
      case "Property":
      case "Text":
      case "URL":
        return 5;
      case "Duration":
        return 4;
      case "null":
        return 8;
    }
  }

  createValidationTypesArray(field, isExtension) {
    let types = []
      .concat(field.alternativeTypes)
      .concat(field.requiredType)
      .concat(field.alternativeModels)
      .concat(field.model)
      .filter(type => type !== undefined);

    // Add nullable types
    types.forEach(fullyQualifiedType => {
      if (this.isTypeNullable(fullyQualifiedType, isExtension)) {
        types.push("null");
      }
    });

    // We get the PHP types from given schema/OA ones,
    // and filter out duplicated types
    types = types
      .slice()
      .sort((a, b) => {
        let scoreA = this.validationTypeWeight(a, isExtension, field);
        let scoreB = this.validationTypeWeight(b, isExtension, field);

        if (scoreA < scoreB) return 1;
        if (scoreA > scoreB) return -1;
        return 0;
      })
      .map(fullyQualifiedType =>
        this.getValidationType(fullyQualifiedType, isExtension, field)
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
        return `\\OpenActive\\Models\\SchemaOrg\\${subClassOfName}`;
      }

      if (this.includedInSchema(model.type)) {
        // If type is from schema.org, we override schema.org
        return `\\OpenActive\\Models\\SchemaOrg\\${subClassOfName}`;
      }

      return `\\OpenActive\\Models\\OA\\${subClassOfName}`;
    }

    if (derivedFrom) {
      let derivedFromName = this.convertToCamelCase(
        this.getPropNameFromFQP(derivedFrom)
      );

      if (this.includedInSchema(derivedFrom)) {
        return `\\OpenActive\\Models\\SchemaOrg\\${derivedFromName}`;
      }

      if (this.includedInSchema(model.type)) {
        // If type is from schema.org, we override schema.org
        return `\\OpenActive\\Models\\SchemaOrg\\${derivedFromName}`;
      }

      // Note if derived from is outside of schema.org there won't be a base class, but it will still be JSON-LD
      return `\\OpenActive\\BaseModel`;
    }

    // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
    // throw new Error("No base class specified for: " + model.type);
    return `\\OpenActive\\BaseModel`;
  }
}

export default PHP;

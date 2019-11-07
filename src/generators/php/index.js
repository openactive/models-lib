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
    const includedInSchema = this.includedInSchema(data.modelType);

    if (!includedInSchema) {
      data["subNamespaceText"] = "\\OA";
    } else {
      data["subNamespaceText"] = "\\SchemaOrg";
    }

    this.enumTemplate = this.enumTemplate || {
      main: await this.loadTemplate(__dirname + "/enum_main.php.mustache"),
      sub: await this.loadTemplate(__dirname + "/enum_sub.php.mustache")
    };

    let response = {
      [this.getEnumFilename(data.typeName)]: this.enumTemplate.main(data)
    };

    for (let value of data.values) {
      let filename = this.getEnumFilename(data.typeName, value.value);
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

  getEnumFilename(typeName, val) {
    if (val) {
      return "/Enums/" + typeName + "/" + val + ".php";
    }
    return "/Enums/" + typeName + ".php";
  }

  convertToClassName(value) {
    return this.convertToCamelCase(value);
  }

  convertToFilename(value) {
    return value;
  }

  validationTypeToLangType(validationType) {
    if(validationType === "Time") {
      return "string";
    }
    if(validationType === "Time[]") {
      return "string[]";
    }
    return validationType;
  }

  getValidationType(fullyQualifiedType, enumMap, modelsMap, isExtension) {
    let baseType = this.getValidationBaseType(
      fullyQualifiedType,
      enumMap,
      modelsMap,
      isExtension
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

  getValidationBaseType(prefixedTypeName, enumMap, modelsMap, isExtension) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "bool";
      case "Date": // TODO: Find better way of representing Date
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
        if (enumMap[typeName]) {
          return "\\OpenActive\\Enums\\" + this.convertToCamelCase(typeName);
        } else if (modelsMap[typeName]) {
          return this.convertToCamelCase(typeName);
        } else if (isExtension) {
          // Extensions may reference schema.org, for which we have no reference here to confirm
          console.log("Extension referenced schema.org property: " + typeName);
          return (
            "\\OpenActive\\Models\\SchemaOrg\\" +
            this.convertToCamelCase(typeName)
          );
        } else {
          throw new Error("Unrecognised type or enum referenced: " + typeName);
        }
    }
  }

  isTypeNullable(prefixedTypeName, enumMap, modelsMap, isExtension) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
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
        if (enumMap[typeName]) {
          return true;
        } else if (modelsMap[typeName]) {
          return false;
        } else if (isExtension) {
          // Extensions may reference schema.org, for which we have no reference here to confirm
          return false;
        } else {
          throw new Error("Unrecognised type or enum referenced: " + typeName);
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

  renderJsonConverter(field, propertyType) {
    if (propertyType == "TimeSpan?") {
      return `[JsonConverter(typeof(OpenActiveTimeSpanToISO8601DurationValuesConverter))]`;
    } else if (field.requiredType == "https://schema.org/Time") {
      return `[JsonConverter(typeof(OpenActiveDateTimeOffsetToISO8601TimeValuesConverter))]`;
    } else if (propertyType.indexOf("Values<") > -1) {
      return `[JsonConverter(typeof(ValuesConverter))]`;
    } else {
      return "";
    }
  }

  createPropertyFromField(field, models, enumMap, hasBaseClass) {
    let memberName = field.extensionPrefix
      ? `${field.extensionPrefix}:${field.fieldName}`
      : field.fieldName;
    let isExtension = !!field.extensionPrefix;
    let isNew = field.derivedFromSchema; // Only need new if sameAs specified as it will be replacing a schema.org type
    let propertyName = this.convertToCamelCase(field.fieldName);
    let propertyType = this.createLangTypeString(
      field,
      models,
      enumMap,
      isExtension
    );
    let propertyTypes = this.createValidationTypesArray(
      field,
      models,
      enumMap,
      isExtension
    );
    let jsonConverter = this.renderJsonConverter(field, propertyType);

    let obj = {
      propName: field.fieldName,
      description: this.createDescription(field),
      codeExample: this.createCodeExample(field),
      propertyType: propertyType,
      propertyTypes: propertyTypes
    };

    if (field.obsolete) {
      return {
        ...obj,
        isObsolete: true,
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
        ...obj,
        decorators: [
          `[DataMember(Name = "${memberName}", EmitDefaultValue = false, Order = ${order})]`,
          jsonConverter
        ].filter(val => val),
        property: `public ${methodType}virtual ${propertyType} ${propertyName} { get; set; } `
      };
    }
  }

  createLangTypeString(field, models, enumMap, isExtension) {
    const validationTypes = this.createValidationTypesArray(field, models, enumMap, isExtension);

    const types = validationTypes.map(type => this.validationTypeToLangType(type));

    // OpenActive SingleValues not allow many of the same type, only allows one
    return types.length > 1 ? `${types.join("|")}` : types[0];
  }

  createValidationTypesArray(field, models, enumMap, isExtension) {
    let types = []
      .concat(field.alternativeTypes)
      .concat(field.requiredType)
      .concat(field.alternativeModels)
      .concat(field.model)
      .filter(type => type !== undefined);

    // Add nullable types
    types.forEach(fullyQualifiedType => {
      if (
        this.isTypeNullable(fullyQualifiedType, enumMap, models, isExtension)
      ) {
        types.push("null");
      }
    });

    // We get the PHP types from given schema/OA ones,
    // and filter out duplicated types
    types = types
      .map(fullyQualifiedType =>
        this.getValidationType(fullyQualifiedType, enumMap, models, isExtension)
      )
      .filter((val, idx, self) => self.indexOf(val) === idx);

    if (types.length == 0) {
      throw new Error("No type found for field: " + field.fieldName);
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

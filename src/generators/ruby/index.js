import Generator from "../../generator";
import Handlebars from "handlebars";

const DATA_MODEL_DOCS_URL_PREFIX =
  "https://developer.openactive.io/data-model/types/";

class Ruby extends Generator {
  mutateExtensions(extensions) {
    return {
      ...require("../../extensions/_schema.json"),
      ...extensions
    };
  }

  // using inplace of standard namespace
  getBasicNamespace(prop) {
    if (this.includedInSchema(prop)) {
      return ["schema"];
    }
    return [];
  }

  getNamespaceParts(prop) {
    return ["OpenActive", "Models", ...this.getBasicNamespace(prop)].map(
      name => {
        return this.snakeToCanonicalName(name);
      }
    );
  }

  formatNamespace(parts) {
    return parts.map(part => `::${part}`).join("");
  }

  setupHandlebars() {
    let that = this;
    Handlebars.registerHelper("pascalCasePropName", function() {
      return new Handlebars.SafeString(that.convertToCamelCase(this.propName));
    });

    Handlebars.registerHelper("snakePropName", propName => {
      return new Handlebars.SafeString(that.canonicalToSnakeName(propName));
    });

    Handlebars.registerHelper("module_start", context => {
      return "  ".repeat(context);
    });
    Handlebars.registerHelper("module_end", function(context, options) {
      let modules = options.data.root.namespace_parts.length;

      return "  ".repeat(modules - context - 1);
    });
    Handlebars.registerHelper("indent", function(context, options) {
      let modules = context.data.root.namespace_parts.length;
      let indent = "  ".repeat(modules);

      let content = context.fn(this);

      let formatted =
        content
          .trimEnd()
          .split("\n")
          .map(line => {
            if (line.trimEnd().length > 0) {
              return `${indent}${line}`;
            } else {
              return "";
            }
          })
          .join("\n") + "\n";

      return formatted;
    });
  }

  async renderModel(data) {
    data["namespace_parts"] = this.getNamespaceParts(data.modelType);

    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.rb.mustache"));

    return this.modelTemplate(data);
  }

  async renderEnum(data) {
    const includedInSchema = this.includedInSchema(data.typeName);

    data["namespace_parts"] = this.getNamespaceParts(data.typeName);

    this.enumTemplate = this.enumTemplate || {
      main: await this.loadTemplate(__dirname + "/enum_main.rb.mustache")
    };

    let response = {
      [this.getEnumFilename(data.typeName)]: this.enumTemplate.main(data)
    };

    return response;
  }

  createIndexFiles() {
    return {
      "/files_index.json": JSON.stringify(this.generatedFiles, null, 2)
    };
  }

  getDirs() {
    return ["models/", "models/schema/", "enums/"];
  }

  getModelFilename(model) {
    let parts = [
      "models",
      ...this.getBasicNamespace(model.type),
      this.getPropNameFromFQP(model.type)
    ];

    parts = parts
      .filter(val => !!val)
      .map(name => {
        console.log(name);
        return this.canonicalToSnakeName(name);
      });

    return "/" + parts.join("/") + ".rb";
  }

  getEnumFilename(typeName) {
    let parts = [
      "enums",
      ...this.getBasicNamespace(typeName),
      this.getPropNameFromFQP(typeName)
    ];

    parts = parts
      .filter(val => !!val)
      .map(name => {
        console.log(name);
        return this.canonicalToSnakeName(name);
      });

    return "/" + parts.join("/") + ".rb";
  }

  convertToClassName(value) {
    return this.convertToCamelCase(value);
  }

  convertToFilename(value) {
    return value;
  }

  getLangType(fullyQualifiedType, enumMap, modelsMap, isExtension) {
    let baseType = this.getLangBaseType(
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

  getLangBaseType(prefixedTypeName, enumMap, modelsMap, isExtension) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    let compactedTypeName = this.getCompacted(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "bool";
      case "Date": // TODO: Find better way of representing Date
      case "DateTime":
      case "Time":
        return "DateTime";
      case "Integer":
        return "int";
      case "Float":
        return "float";
      case "Number":
        return "decimal";
      case "Text":
        return "string";
      case "Duration":
        return "DateInterval";
      case "URL":
      case "Property":
        return "Uri";
      case "null":
        return "null";
      default:
        if (enumMap[compactedTypeName]) {
          // if (this.includedInSchema(enumMap[typeName].namespace)) {
          //   return "Schema.NET." + this.convertToCamelCase(typeName);
          // } else {
          return this.convertToCamelCase(typeName);
          // }
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
          throw new Error(
            "Unrecognised type or enum referenced: " +
              typeName +
              ", " +
              compactedTypeName
          );
        }
    }
  }

  isTypeNullable(prefixedTypeName, enumMap, modelsMap, isExtension) {
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
        if (enumMap[typeName]) {
          return true;
        } else if (enumMap[compactedTypeName]) {
          return true;
        } else if (modelsMap[typeName]) {
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
    let propertyType = this.createTypeString(
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
      propertyType: propertyType
    };

    if (field.obsolete) {
      return {
        ...obj,
        decorators: [
          `[Obsolete("This property is disinherited in this type, and must not be used.", true)]`
        ],
        property: `public override ${propertyType} ${propertyName} { get; set; }`
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

  createTypeString(field, models, enumMap, isExtension) {
    const types = this.createTypesArray(field, models, enumMap, isExtension);

    // OpenActive SingleValues not allow many of the same type, only allows one
    return types.length > 1 ? `${types.join("|")}` : types[0];
  }

  createTypesArray(field, models, enumMap, isExtension) {
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
        this.getLangType(fullyQualifiedType, enumMap, models, isExtension)
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
      return `::OpenActive::BaseModel`;
    }

    // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
    // throw new Error("No base class specified for: " + model.type);
    return `::OpenActive::BaseModel`;
  }
}

export default Ruby;

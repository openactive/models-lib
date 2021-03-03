const Generator = require('../../generator');
const Handlebars = require('handlebars');

class Ruby extends Generator {
  mutateExtensions(extensions) {
    return {
      ...extensions
    };
  }

  get generateSchemaOrgModel () {
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
    data["namespace_parts"] = this.getNamespaceParts(data.modelType, "Models");

    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.rb.mustache"));

    return this.modelTemplate(data);
  }

  async renderEnum(data) {
    const includedInSchema = this.includedInSchema(data.enumType);

    data["namespace_parts"] = this.getNamespaceParts(data.enumType, "Enums");

    this.enumTemplate = this.enumTemplate || {
      main: await this.loadTemplate(__dirname + "/enum_main.rb.mustache")
    };

    let response = {
      [this.getEnumFilename(data)]: this.enumTemplate.main(data)
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

  getEnumFilename(thisEnum) {
    let parts = [
      "enums",
      ...this.getBasicNamespace(thisEnum.enumType),
      this.getPropNameFromFQP(thisEnum.enumType)
    ];

    parts = parts
      .filter(val => !!val)
      .map(name => {
        return this.canonicalToSnakeName(name);
      });

    return "/" + parts.join("/") + ".rb";
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

  getDocType(fullyQualifiedType, isExtension, field) {
    let baseType = this.getDocBaseType(fullyQualifiedType, isExtension, field);
    if (this.isArray(fullyQualifiedType)) {
      return `Array<${baseType}>`;
    } else {
      return baseType;
    }
  }

  getDocBaseType(prefixedTypeName, isExtension, model) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);

    switch (typeName) {
      case "Boolean":
        return "Boolean";
      case "null":
      case "nil":
        return "nil";
      case "Number":
        return "BigDecimal";
      case "Text":
        return "String";
      case "Duration":
        return "ActiveSupport::Duration";
    }

    return this.getValidationBaseType(prefixedTypeName, isExtension, model);
  }

  getValidationBaseType(prefixedTypeName, isExtension, model) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "bool";
      case "Date": // TODO: Find better way of representing Date
        return "Date";
      case "DateTime":
        return "DateTime";
      case "Time":
        return "Time";
      case "Integer":
        return "int";
      case "Float":
        return "float";
      case "Number":
        return "Number";
      case "Text":
        return "string";
      case "Duration":
        return "DateInterval";
      case "URL":
      case "Property":
        return "URI";
      case "null":
        return "null";
      default:
        let compactedTypeName = this.getCompacted(prefixedTypeName);
        let extension = this.extensions[model.extensionPrefix];

        if (this.enumMap[typeName] && extension && extension.preferOA) {
          return "OpenActive::Enums::" + this.convertToCamelCase(typeName);
        } else if (this.enumMap[compactedTypeName]) {
          let extension = this.extensions[model.extensionPrefix];
          if (extension && extension.preferOA && this.enumMap[typeName]) {
            compactedTypeName = typeName;
          }

          if (this.includedInSchema(compactedTypeName)) {
            return (
              "OpenActive::Enums::Schema::" + this.convertToCamelCase(typeName)
            );
          }
          return "OpenActive::Enums::" + this.convertToCamelCase(typeName);
        } else if (this.models[typeName] && extension && extension.preferOA) {
          return "OpenActive::Models::" + this.convertToCamelCase(typeName);
        } else if (this.models[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName)) {
            return (
              "OpenActive::Models::Schema::" + this.convertToCamelCase(typeName)
            );
          }
          return "OpenActive::Models::" + this.convertToCamelCase(typeName);
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

  createPropertyFromField(field, models, enumMap, hasBaseClass, model) {
    let memberName = field.memberName || field.fieldName;
    let isExtension = !!field.extensionPrefix;
    let isNew = field.derivedFromSchema; // Only need new if sameAs specified as it will be replacing a schema.org type
    let propertyName = this.convertToCamelCase(field.fieldName);
    let propertyType = this.createLangTypeString(field, isExtension);
    let propertyTypes = this.createValidationTypesArray(
      field,
      isExtension,
      model
    );

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
    const types = this.createDocTypesArray(field, isExtension);

    return `[${types.join(",")}]`;
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

  createDocTypesArray(field, isExtension) {
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

    // We get the types from given schema/OA ones,
    // and filter out duplicated types
    types = types
      .map(fullyQualifiedType =>
        this.getDocType(fullyQualifiedType, isExtension, field)
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

module.exports = Ruby;

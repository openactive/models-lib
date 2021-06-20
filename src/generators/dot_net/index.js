const Generator = require('../../generator');

class DotNet extends Generator {
  async renderModel(data) {
    this.modelTemplate =
      this.modelTemplate ||
      (await this.loadTemplate(__dirname + "/model.cs.mustache"));

    return this.modelTemplate(data);
  }

  async renderEnum(data) {
    this.enumTemplate =
      this.enumTemplate ||
      (await this.loadTemplate(__dirname + "/enum.cs.mustache"));

    return this.enumTemplate(data);
  }

  getDirs() {
    return ["/models/", "/enums/"];
  }

  getModelFilename(model) {
    return "/models/" + this.getPropNameFromFQP(model.type) + ".cs";
  }

  getEnumFilename(typeName) {
    return "/enums/" + this.getPropNameFromFQP(typeName) + ".cs";
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

  getLangBaseType(prefixedTypeName, enumMap, modelsMap, isExtension) {
    let typeName = this.getPropNameFromFQP(prefixedTypeName);
    let compactedTypeName = this.getCompacted(prefixedTypeName);
    switch (typeName) {
      case "Boolean":
        return "bool?";
      case "Date":
      case "DateTime":
      case "Time":
        return "DateTimeOffset?";
      case "Integer":
        return "long?";
      case "Float":
        return "decimal?";
      case "Number":
        return "decimal?";
      case "Text":
        return "string";
      case "Duration":
        return "TimeSpan?";
      case "URL":
        return "Uri";
      case "Property":
        return `${this.propertyEnumerationName}?`;
      default:
        if (enumMap[compactedTypeName]) {
          if (this.includedInSchema(compactedTypeName) && !enumMap[compactedTypeName].isSchemaPending) {
            return "Schema.NET." + this.convertToCamelCase(typeName) + "?";
          } else {
            return this.convertToCamelCase(typeName) + "?";
          }
        } else if (modelsMap[typeName] || modelsMap[compactedTypeName]) {
          return this.convertToCamelCase(typeName);
        } else if (isExtension && this.includedInSchema(compactedTypeName)) {
          // Extensions may reference schema.org, for which we have no reference here to confirm
          console.log("Extension referenced schema.org property: " + typeName);
          return "Schema.NET." + this.convertToCamelCase(typeName);
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
        "<code>\n" +
        (fieldName ? `"` + fieldName + `": ` : "") +
        JSON.stringify(code, null, 2) +
        "\n</code>"
      );
    } else {
      let isNumber =
        requiredType &&
        (requiredType.indexOf("Integer") > -1 ||
          requiredType.indexOf("Float") > -1 ||
          requiredType.indexOf("Number") > -1);
      return (
        "<code>\n" +
        (fieldName ? `"` + fieldName + `": ` : "") +
        (isNumber ? code : `"` + code + `"`) +
        "\n</code>"
      );
    }
  }

  renderJsonConverter(field, propertyType) {
    if (propertyType == "TimeSpan?") {
      return `[JsonConverter(typeof(OpenActiveTimeSpanToISO8601DurationValuesConverter))]`;
    } else if (field.requiredType == "https://schema.org/Time") {
      return `[JsonConverter(typeof(OpenActiveDateTimeOffsetToISO8601TimeValuesConverter))]`;
    } else if (propertyType == 'DateTimeOffset?') {
      return `[JsonConverter(typeof(OpenActiveDateTimeOffsetToISO8601DateTimeValuesConverter))]`;
    } else if (propertyType.indexOf("Values<") > -1 || field.requiredType || field.model || field.alternativeModels) {
      return `[JsonConverter(typeof(ValuesConverter))]`;
    } else {
      //return "";
      // TODO: This could be switched back to empty string, with a thorough analysis of where ValuesConverter is actually required
      return `[JsonConverter(typeof(ValuesConverter))]`;
    }
  }

  createPropertyFromField(field, models, enumMap, hasBaseClass) {
    let memberName = field.memberName || field.fieldName;
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

    if (field.disinherit) {
      return {
        decorators: [
          `[Obsolete("This property is disinherited in this type, and must not be used.", true)]`
        ],
        property: `public override ${propertyType} ${propertyName} { get; set; }`
      };
    } else {
      let methodType = "virtual";
      if (field.override) {
        methodType = "override";
      } else if (!isExtension && hasBaseClass && (isNew || field.override)) {
        methodType = "new virtual";
      }

      let order = field.order;
      if (isExtension) {
        order += 1000;
      }

      // TODO add to Ruby
      let deprecate = field.deprecationGuidance ? `[Obsolete("${field.deprecationGuidance}", false)]` : null;
      // TODO add to PHP and Ruby
      let defaultContent = field.defaultContent ?
        (Number.isInteger(field.defaultContent) ? ` = ${field.defaultContent};` : ` = "${field.defaultContent.replace(/"/g, '\\"')}";`)
        : "";

      return {
        codeExample: this.createCodeExample(field),
        description: this.createDescription(field),
        decorators: [
          `[DataMember(Name = "${memberName}", EmitDefaultValue = false, Order = ${order})]`,
          jsonConverter,
          deprecate
        ].filter(val => val),
        property: `public ${methodType} ${propertyType} ${propertyName} { get; set; }${defaultContent}`
      };
    }
  }

  createTypeString(field, models, enumMap, isExtension) {
    if (field.valueConstraint === 'UUID') {
      return `Guid?`
    }

    let types = []
      .concat(field.alternativeTypes)
      .concat(field.requiredType)
      .concat(field.alternativeModels)
      .concat(field.model)
      .filter(type => type !== undefined);

    types = Array.from(new Set(types.map(fullyQualifiedType =>
      this.getLangType(fullyQualifiedType, enumMap, models, isExtension)
    )));

    if (types.length == 0) {
      throw new Error("No type found for field: " + field.fieldName);
    }

    // Use ILegalEntity in place of SingleValues<Organization, Person>
    if (types.length == 2 && types.includes('Organization') && types.includes('Person')) {
      return field.allowReferencing ? `ReferenceValue<ILegalEntity>` : `ILegalEntity`;
    }

    if (field.allowReferencing) {
      if (types.length > 1) {
        throw new Error("Multiple types with allowReferencing enabled not supported: " + field.fieldName); 
      }
      return `ReferenceValue<${types[0]}>`;
    }

    // OpenActive SingleValues not allow many of the same type, only allows one
    return types.length > 1 ? `SingleValues<${types.join(", ")}>` : types[0];
  }

  calculateInherits(subClassOf, derivedFrom, model) {
    // Prioritise subClassOf over derivedFrom
    if (subClassOf) {
      let subClassOfName = this.convertToCamelCase(
        this.getPropNameFromFQP(subClassOf)
      );
      if (this.includedInSchema(subClassOf)) {
        return `Schema.NET.${subClassOfName}`;
      } else {
        return `${subClassOfName}`;
      }
    }
    
    if (derivedFrom) {
      let derivedFromName = this.convertToCamelCase(
        this.getPropNameFromFQP(derivedFrom)
      );
      if (this.includedInSchema(derivedFrom)) {
        return `Schema.NET.${derivedFromName}`;
      } else {
        // Note if derived from is outside of schema.org there won't be a base class, but it will still be JSON-LD
        return `Schema.NET.JsonLdObject`;
      }
    }

    // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
    return `Schema.NET.JsonLdObject`;
  }
}

module.exports = DotNet;

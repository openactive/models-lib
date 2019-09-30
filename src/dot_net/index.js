import Generator from '../generator';

const DATA_MODEL_DOCS_URL_PREFIX = "https://developer.openactive.io/data-model/types/";

class DotNet extends Generator {
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
}

export default DotNet;

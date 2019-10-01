import Generator from "../generator";
import Handlebars from "handlebars";
import fs from "fs";

const DATA_MODEL_DOCS_URL_PREFIX = "https://developer.openactive.io/data-model/types/";

class DotNet extends Generator {

  renderModel (data) {
    this.modelTemplate = this.modelTemplate ||
      Handlebars.compile(
        fs.readFileSync(__dirname + "/model.cs.mustache", "utf8"),
      );

    return this.modelTemplate(data);
  }

  renderEnum (data) {
    this.enumTemplate = this.enumTemplate ||
      Handlebars.compile(
        fs.readFileSync(__dirname + "/enum.cs.mustache", "utf8"),
      );

    return this.enumTemplate(data);
  }

  getModelFilename (model) {
    return "models/" + this.getPropNameFromFQP(model.type) + ".cs";
  }

  convertToClassName (value) {
    return this.convertToCamelCase(value);
  }

  convertToFilename (value) {
    return value;
  }

  createModelFile (model, models, extensions, enumMap) {
    let fullFields = this.obsoleteNotInSpecFields(model, models);
    let fullFieldsList = Object.values(fullFields).
      sort(this.compareFields).
      map((field, index) => {
        field.order = index + 6;
        return field;
      });
    // let fullModel = this.createFullModel(fullFields, model, models);
    let derivedFrom = this.getPropertyWithInheritance("derivedFrom", model,
      models);
    // let derivedFromName = this.convertToCamelCase(
    //   this.getPropNameFromFQP(derivedFrom));

    let inherits = this.calculateInherits(model.subClassOf, derivedFrom, model);

    // Note hasBaseClass is used here to ensure that assumptions about schema.org fields requiring overrides are not applied if the base class doesn't exist in the model
    let hasBaseClass = this.hasBaseClass(model.subClassOf, derivedFrom);

    let doc = this.createModelDoc(model, models);

    let data = {
      classDoc: doc,
      className: this.convertToClassName(this.getPropNameFromFQP(model.type)),
      inherits: inherits,
      modelType: model.type,
      fieldList: this.createTableFromFieldList(fullFieldsList, models, enumMap,
        hasBaseClass),
    };

    return this.renderModel(data);
  }

  createEnumFile (typeName, thisEnum) {
    let doc = this.createEnumDoc(typeName, thisEnum);

    let data = {
      typeName: typeName,
      enumDoc: doc,
      values: thisEnum.values.map(value => ({
        memberVal: thisEnum.namespace + value,
        value: value,
      })),
    };

    return this.renderEnum(data);
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

  getLangType (fullyQualifiedType, enumMap, modelsMap, isExtension) {
    let baseType = this.getLangBaseType(fullyQualifiedType, enumMap,
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

  getLangBaseType (prefixedTypeName, enumMap, modelsMap, isExtension) {
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
          hasBaseClass));
  }

  renderJsonConverter (field, propertyType) {
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

    if (field.obsolete) {
      return {
        description: this.createDescriptionWithExample(field),
        decorators: [
          `[Obsolete("This property is disinherited in this type, and must not be used.", true)]`,
        ],
        property: `public override ${propertyType} ${propertyName} { get; set; }`,
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
        description: this.createDescriptionWithExample(field),
        decorators: [
          `[DataMember(Name = "${memberName}", EmitDefaultValue = false, Order = ${order})]`,
          jsonConverter,
        ].filter((val) => val),
        property: `public ${methodType}virtual ${propertyType} ${propertyName} { get; set; } `,
      };
    }
  }

  createTypeString (field, models, enumMap, isExtension) {
    let types = [].concat(field.alternativeTypes).
      concat(field.requiredType).
      concat(field.alternativeModels).
      concat(field.model).
      filter(type => type !== undefined);

    types = types.map(
      fullyQualifiedType => this.getLangType(fullyQualifiedType, enumMap,
        models,
        isExtension));

    if (types.length == 0) {
      throw new Error("No type found for field: " + field.fieldName);
    }

    // OpenActive SingleValues not allow many of the same type, only allows one
    return types.length > 1 ? `SingleValues<${types.join(", ")}>` : types[0];
  }

  calculateInherits (subClassOf, derivedFrom, model) {
    // Prioritise subClassOf over derivedFrom
    if (subClassOf) {
      let subClassOfName = this.convertToCamelCase(
        this.getPropNameFromFQP(subClassOf));
      if (this.includedInSchema(subClassOf)) {
        return `Schema.NET.${subClassOfName}`;
      } else {
        return `${subClassOfName}`;
      }
    } else if (derivedFrom) {
      let derivedFromName = this.convertToCamelCase(
        this.getPropNameFromFQP(derivedFrom));
      if (this.includedInSchema(derivedFrom)) {
        return `Schema.NET.${derivedFromName}`;
      } else {
        // Note if derived from is outside of schema.org there won't be a base class, but it will still be JSON-LD
        return `Schema.NET.JsonLdObject`;
      }
    } else {
      // In the model everything is one or the other (at a minimum must inherit https://schema.org/Thing)
      throw new Error("No base class specified for: " + model.type);
    }
  }
}

export default DotNet;

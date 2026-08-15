export function createPublicProjection(entities, assessmentLog) {
  if (!entities?.metadata || !Array.isArray(entities.vessels)) {
    throw new Error("Canonical vessel data is malformed.");
  }
  const assessments = new Map(
    assessmentLog.assessments.map((assessment) => [assessment.assessmentId, assessment]),
  );

  return {
    metadata: structuredClone(entities.metadata),
    vessels: entities.vessels.map((entity) => {
      const assessmentId = assessmentLog.currentAssessmentIds[entity.vesselId];
      const assessment = assessments.get(assessmentId);
      if (!assessment || assessment.vesselId !== entity.vesselId) {
        throw new Error(`No current assessment for ${entity.vesselId}.`);
      }
      return {
        id: entity.vesselId,
        name: entity.name,
        service: entity.service,
        vesselClass: entity.vesselClass,
        vesselType: entity.vesselType,
        pennantNumber: entity.pennantNumber,
        commissionedDate: entity.commissionedDate,
        homePort: entity.homePort,
        ...structuredClone(assessment.assessedState),
      };
    }),
  };
}

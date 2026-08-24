export function filterShoreEstablishments(establishments, { query = "", type = "" } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-GB");
  return establishments.filter((establishment) => {
    const matchesType = !type || establishment.type === type;
    const matchesQuery =
      !normalizedQuery ||
      [establishment.name, establishment.location, establishment.role]
        .join(" ")
        .toLocaleLowerCase("en-GB")
        .includes(normalizedQuery);
    return matchesType && matchesQuery;
  });
}

export function shoreTypes(establishments) {
  return [...new Set(establishments.map((establishment) => establishment.type))].sort((left, right) =>
    left.localeCompare(right),
  );
}

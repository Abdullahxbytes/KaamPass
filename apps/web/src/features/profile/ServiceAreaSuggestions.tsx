const serviceAreas = [
  'Islamabad',
  'Rawalpindi',
  'Lahore',
  'Karachi',
  'Peshawar',
  'Faisalabad',
  'Multan',
  'Gujranwala',
  'Sialkot',
  'Quetta',
  'Hyderabad',
  'Bahawalpur',
]

export const serviceAreaListId = 'kaampass-service-areas'

export function ServiceAreaSuggestions() {
  return (
    <datalist id={serviceAreaListId}>
      {serviceAreas.map((area) => (
        <option key={area} value={area} />
      ))}
    </datalist>
  )
}

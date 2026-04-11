import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { generateRandomContract } from '../utils/randomData';

interface ContractTemplate {
  id: string;
  name: string;
  fields: string[];
}

interface Contract {
  id?: string;
  propertyId?: string;
  contactId?: string;
  agentId?: string;
  data: Record<string, any>;
}

interface Property {
  id: string;
  title: string;
  address: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
}

interface Agent {
  id: string;
  name: string;
}

interface ContractModalProps {
  template: ContractTemplate;
  contract: Contract | null;
  properties: Property[];
  contacts: Contact[];
  agents: Agent[];
  onSave: (contractData: any) => void;
  onClose: () => void;
}

export function ContractModal({
  template,
  contract,
  properties,
  contacts,
  agents,
  onSave,
  onClose
}: ContractModalProps) {
  const [formData, setFormData] = useState(() => {
    const initialData: Record<string, any> = {
      // Parti contrattuali
      locatori_multipli: contract?.data?.locatori_multipli || false,
      conduttori_multipli: contract?.data?.conduttori_multipli || false,
      locatori: contract?.data?.locatori || [{ nome: '', nascita_luogo: '', nascita_data: '', residenza: '', via: '', civico: '', cf: '' }],
      conduttori: contract?.data?.conduttori || [{ nome: '', nascita_luogo: '', nascita_data: '', residenza: '', via: '', civico: '', cf: '', documento_tipo: '', documento_numero: '', documento_comune: '', documento_data: '' }],
      
      // Clausole opzionali
      include_deposito_precedente: contract?.data?.include_deposito_precedente || false,
      include_arredi: contract?.data?.include_arredi || true,
      include_cedolare_secca: contract?.data?.include_cedolare_secca || true
    }
    
    // Aggiungi altri campi del template
    template.fields.forEach(field => {
      if (!initialData.hasOwnProperty(field)) {
        initialData[field] = contract?.data[field] || ''
      }
    })
    
    return {
      templateId: template.id,
      templateName: template.name,
      propertyId: contract?.propertyId || '',
      contactId: contract?.contactId || '',
      agentId: contract?.agentId || '1',
      data: initialData
    }
  })
  
  const [showGenerated, setShowGenerated] = useState(false)
  const [generatedText, setGeneratedText] = useState('')
  const [generating, setGenerating] = useState(false)

  const selectedProperty = properties.find(p => p.id === formData.propertyId)
  const selectedContact = contacts.find(c => c.id === formData.contactId)
  const selectedAgent = agents.find(a => a.id === formData.agentId)

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      data: { ...prev.data, [field]: value }
    }))
  }

  const addLocatore = () => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        locatori: [...prev.data.locatori, { nome: '', nascita_luogo: '', nascita_data: '', residenza: '', via: '', civico: '', cf: '' }]
      }
    }))
  }

  const removeLocatore = (index: number) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        locatori: prev.data.locatori.filter((_: any, i: number) => i !== index)
      }
    }))
  }

  const updateLocatore = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        locatori: prev.data.locatori.map((loc: any, i: number) => 
          i === index ? { ...loc, [field]: value } : loc
        )
      }
    }))
  }

  const addConduttore = () => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        conduttori: [...prev.data.conduttori, { nome: '', nascita_luogo: '', nascita_data: '', residenza: '', via: '', civico: '', cf: '', documento_tipo: '', documento_numero: '', documento_comune: '', documento_data: '' }]
      }
    }))
  }

  const removeConduttore = (index: number) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        conduttori: prev.data.conduttori.filter((_: any, i: number) => i !== index)
      }
    }))
  }

  const updateConduttore = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        conduttori: prev.data.conduttori.map((cond: any, i: number) => 
          i === index ? { ...cond, [field]: value } : cond
        )
      }
    }))
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      // Prima salva il contratto
      const contractData = {
        ...formData,
        propertyTitle: selectedProperty?.title,
        contactName: selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : '',
        agentName: selectedAgent?.name || 'N/A'
      }

      let contractId = contract?.id
      if (!contractId) {
        // Crea nuovo contratto
        const response = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractData)
        })
        const result = await response.json()
        contractId = result.data.id
      } else {
        // Aggiorna contratto esistente
        await fetch(`/api/contracts/${contractId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractData)
        })
      }

      // Genera il contratto compilato
      const generateResponse = await fetch(`/api/contracts/${contractId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const generateResult = await generateResponse.json()
      
      if (generateResult.success) {
        setGeneratedText(generateResult.generatedText)
        setShowGenerated(true)
      }
    } catch (error) {
      console.error('Errore generazione contratto:', error)
    } finally {
      setGenerating(false)
    }
  }

  const handleAutoFill = () => {
    // Pick random references
    const randomProperty = properties.length > 0 ? properties[Math.floor(Math.random() * properties.length)] : null;
    const randomContact = contacts.length > 0 ? contacts[Math.floor(Math.random() * contacts.length)] : null;
    const randomAgent = agents.length > 0 ? agents[Math.floor(Math.random() * agents.length)] : null;

    const randomData = generateRandomContract();

    setFormData(prev => ({
      ...prev,
      propertyId: randomProperty?.id || prev.propertyId,
      contactId: randomContact?.id || prev.contactId,
      agentId: randomAgent?.id || prev.agentId,
      data: {
        ...prev.data,
        ...randomData,
        ...template.fields.reduce((acc, field) => {
            // @ts-ignore
            const val = randomData[field];
            return {
                ...acc,
                [field]: val !== undefined ? val : `Valore ${field}`
            };
        }, {})
      }
    }));
  };

  if (showGenerated) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          width: '95%',
          maxWidth: '900px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{ 
            padding: '1.5rem', 
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setShowGenerated(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                ← Torna alla Modifica
              </button>
              <button
                onClick={() => {
                  onSave(formData)
                  onClose()
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                ✓ Salva Contratto
              </button>
              <button
                onClick={onClose}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Contratto Generato */}
          <div style={{ 
            flex: 1, 
            padding: '2rem', 
            overflow: 'auto',
            backgroundColor: '#f9fafb'
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              fontFamily: 'Times, serif',
              lineHeight: '1.6',
              whiteSpace: 'pre-line'
            }}>
              {generatedText}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        width: '95%',
        maxWidth: '900px',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '1.5rem', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            📝 {contract ? 'Modifica' : 'Nuovo'} - {template.name}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleAutoFill}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#f0f9ff',
                color: '#0284c7',
                border: '1px solid #bae6fd',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e0f2fe'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f0f9ff'}
            >
              <Wand2 size={16} />
              Auto-fill
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          <form onSubmit={(e) => {
            e.preventDefault()
            onSave({
              ...formData,
              propertyTitle: selectedProperty?.title,
              contactName: selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : '',
              agentName: selectedAgent?.name || 'N/A'
            })
          }}>
            {/* Selezione Dati Base */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
              gap: '1rem', 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '0.5rem'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  🏠 Immobile (Opzionale)
                </label>
                <select
                  value={formData.propertyId}
                  onChange={(e) => setFormData(prev => ({ ...prev, propertyId: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Seleziona immobile...</option>
                  {properties.map(property => (
                    <option key={property.id} value={property.id}>
                      {property.title} - {property.address}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  👤 Cliente (Opzionale)
                </label>
                <select
                  value={formData.contactId}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactId: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Seleziona cliente...</option>
                  {contacts.map(contact => (
                    <option key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  👨‍💼 Agente Responsabile *
                </label>
                <select
                  value={formData.agentId}
                  onChange={(e) => setFormData(prev => ({ ...prev, agentId: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white'
                  }}
                  required
                >
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clausole Opzionali */}
            <div style={{ 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#fef3c7',
              borderRadius: '0.5rem',
              border: '1px solid #f59e0b'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#92400e' }}>
                📋 Clausole Opzionali
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.include_deposito_precedente}
                    onChange={(e) => handleFieldChange('include_deposito_precedente', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>💰 Deposito precedente (Art. 12.3)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.include_arredi}
                    onChange={(e) => handleFieldChange('include_arredi', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>🪑 Arredi e consegna chiavi (Art. 14)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.include_cedolare_secca}
                    onChange={(e) => handleFieldChange('include_cedolare_secca', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>📊 Cedolare secca (Art. 16)</span>
                </label>
              </div>
            </div>

            {/* Parti Contrattuali - Locatori */}
            <div style={{ 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              borderRadius: '0.5rem',
              border: '1px solid #0ea5e9'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0c4a6e' }}>
                  🏠 Locatori
                </h3>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.locatori_multipli}
                    onChange={(e) => {
                      handleFieldChange('locatori_multipli', e.target.checked)
                      if (!e.target.checked && formData.data.locatori.length > 1) {
                        setFormData(prev => ({
                          ...prev,
                          data: { ...prev.data, locatori: [prev.data.locatori[0]] }
                        }))
                      }
                    }}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Locatori multipli</span>
                </label>
              </div>
              
              {formData.data.locatori.map((locatore: any, index: number) => (
                <div key={index} style={{ 
                  marginBottom: '1rem',
                  padding: '1rem',
                  backgroundColor: 'white',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: '500' }}>
                      Locatore {index + 1}
                    </h4>
                    {formData.data.locatori_multipli && formData.data.locatori.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLocatore(index)}
                        style={{
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        ✕ Rimuovi
                      </button>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Nome e Cognome *
                      </label>
                      <input
                        type="text"
                        value={locatore.nome}
                        onChange={(e) => updateLocatore(index, 'nome', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Luogo di Nascita
                      </label>
                      <input
                        type="text"
                        value={locatore.nascita_luogo}
                        onChange={(e) => updateLocatore(index, 'nascita_luogo', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Data di Nascita
                      </label>
                      <input
                        type="date"
                        value={locatore.nascita_data}
                        onChange={(e) => updateLocatore(index, 'nascita_data', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Residenza
                      </label>
                      <input
                        type="text"
                        value={locatore.residenza}
                        onChange={(e) => updateLocatore(index, 'residenza', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Via
                      </label>
                      <input
                        type="text"
                        value={locatore.via}
                        onChange={(e) => updateLocatore(index, 'via', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Civico
                      </label>
                      <input
                        type="text"
                        value={locatore.civico}
                        onChange={(e) => updateLocatore(index, 'civico', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Codice Fiscale
                      </label>
                      <input
                        type="text"
                        value={locatore.cf}
                        onChange={(e) => updateLocatore(index, 'cf', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {formData.data.locatori_multipli && (
                <button
                  type="button"
                  onClick={addLocatore}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  + Aggiungi Locatore
                </button>
              )}
            </div>

            {/* Parti Contrattuali - Conduttori */}
            <div style={{ 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#f0fdf4',
              borderRadius: '0.5rem',
              border: '1px solid #22c55e'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#166534' }}>
                  👤 Conduttori
                </h3>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.data.conduttori_multipli}
                    onChange={(e) => {
                      handleFieldChange('conduttori_multipli', e.target.checked)
                      if (!e.target.checked && formData.data.conduttori.length > 1) {
                        setFormData(prev => ({
                          ...prev,
                          data: { ...prev.data, conduttori: [prev.data.conduttori[0]] }
                        }))
                      }
                    }}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Conduttori multipli</span>
                </label>
              </div>
              
              {formData.data.conduttori.map((conduttore: any, index: number) => (
                <div key={index} style={{ 
                  marginBottom: '1rem',
                  padding: '1rem',
                  backgroundColor: 'white',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: '500' }}>
                      Conduttore {index + 1}
                    </h4>
                    {formData.data.conduttori_multipli && formData.data.conduttori.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeConduttore(index)}
                        style={{
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        ✕ Rimuovi
                      </button>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Nome e Cognome *
                      </label>
                      <input
                        type="text"
                        value={conduttore.nome}
                        onChange={(e) => updateConduttore(index, 'nome', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Luogo di Nascita
                      </label>
                      <input
                        type="text"
                        value={conduttore.nascita_luogo}
                        onChange={(e) => updateConduttore(index, 'nascita_luogo', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Data di Nascita
                      </label>
                      <input
                        type="date"
                        value={conduttore.nascita_data}
                        onChange={(e) => updateConduttore(index, 'nascita_data', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Residenza
                      </label>
                      <input
                        type="text"
                        value={conduttore.residenza}
                        onChange={(e) => updateConduttore(index, 'residenza', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Via
                      </label>
                      <input
                        type="text"
                        value={conduttore.via}
                        onChange={(e) => updateConduttore(index, 'via', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Civico
                      </label>
                      <input
                        type="text"
                        value={conduttore.civico}
                        onChange={(e) => updateConduttore(index, 'civico', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Codice Fiscale
                      </label>
                      <input
                        type="text"
                        value={conduttore.cf}
                        onChange={(e) => updateConduttore(index, 'cf', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Tipo Documento
                      </label>
                      <select
                        value={conduttore.documento_tipo}
                        onChange={(e) => updateConduttore(index, 'documento_tipo', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="">Seleziona...</option>
                        <option value="Carta d'Identità">Carta d'Identità</option>
                        <option value="Patente">Patente</option>
                        <option value="Passaporto">Passaporto</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Numero Documento
                      </label>
                      <input
                        type="text"
                        value={conduttore.documento_numero}
                        onChange={(e) => updateConduttore(index, 'documento_numero', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Comune Rilascio
                      </label>
                      <input
                        type="text"
                        value={conduttore.documento_comune}
                        onChange={(e) => updateConduttore(index, 'documento_comune', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Data Rilascio
                      </label>
                      <input
                        type="date"
                        value={conduttore.documento_data}
                        onChange={(e) => updateConduttore(index, 'documento_data', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {formData.data.conduttori_multipli && (
                <button
                  type="button"
                  onClick={addConduttore}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  + Aggiungi Conduttore
                </button>
              )}
            </div>

            {/* Altri Campi del Contratto */}
            <div style={{ 
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#f8fafc',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#475569' }}>
                📋 Dati del Contratto
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {/* Immobile */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Comune Immobile
                  </label>
                  <input
                    type="text"
                    value={formData.data.immobile_comune || ''}
                    onChange={(e) => handleFieldChange('immobile_comune', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Via Immobile
                  </label>
                  <input
                    type="text"
                    value={formData.data.immobile_via || ''}
                    onChange={(e) => handleFieldChange('immobile_via', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Civico
                  </label>
                  <input
                    type="text"
                    value={formData.data.immobile_civico || ''}
                    onChange={(e) => handleFieldChange('immobile_civico', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Durata e Date */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Durata (mesi)
                  </label>
                  <input
                    type="number"
                    value={formData.data.durata_mesi || ''}
                    onChange={(e) => handleFieldChange('durata_mesi', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Data Inizio
                  </label>
                  <input
                    type="date"
                    value={formData.data.data_inizio || ''}
                    onChange={(e) => handleFieldChange('data_inizio', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Data Fine
                  </label>
                  <input
                    type="date"
                    value={formData.data.data_fine || ''}
                    onChange={(e) => handleFieldChange('data_fine', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Canone */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Canone Mensile (€)
                  </label>
                  <input
                    type="number"
                    value={formData.data.canone_mensile || ''}
                    onChange={(e) => handleFieldChange('canone_mensile', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Deposito */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Deposito Cauzionale (€)
                  </label>
                  <input
                    type="number"
                    value={formData.data.deposito_cauzionale || ''}
                    onChange={(e) => handleFieldChange('deposito_cauzionale', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Campi condizionali per deposito precedente */}
                {formData.data.include_deposito_precedente && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Deposito Precedente (€)
                      </label>
                      <input
                        type="number"
                        value={formData.data.deposito_precedente || ''}
                        onChange={(e) => handleFieldChange('deposito_precedente', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Integrazione Deposito (€)
                      </label>
                      <input
                        type="number"
                        value={formData.data.deposito_integrazione || ''}
                        onChange={(e) => handleFieldChange('deposito_integrazione', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Campi condizionali per arredi */}
                {formData.data.include_arredi && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Chiavi Immobile
                      </label>
                      <input
                        type="number"
                        value={formData.data.chiavi_immobile || ''}
                        onChange={(e) => handleFieldChange('chiavi_immobile', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Chiavi Posta
                      </label>
                      <input
                        type="number"
                        value={formData.data.chiavi_posta || ''}
                        onChange={(e) => handleFieldChange('chiavi_posta', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Campi condizionali per cedolare secca */}
                {formData.data.include_cedolare_secca && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                      Cedolare Secca
                    </label>
                    <select
                      value={formData.data.cedolare_secca || ''}
                      onChange={(e) => handleFieldChange('cedolare_secca', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">Seleziona...</option>
                      <option value="optare">Optare</option>
                      <option value="non optare">Non optare</option>
                    </select>
                  </div>
                )}

                {/* Altri campi */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Luogo Firma
                  </label>
                  <input
                    type="text"
                    value={formData.data.luogo_firma || ''}
                    onChange={(e) => handleFieldChange('luogo_firma', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Data Firma
                  </label>
                  <input
                    type="date"
                    value={formData.data.data_firma || ''}
                    onChange={(e) => handleFieldChange('data_firma', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '1.5rem', 
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Annulla
          </button>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: generating ? '#9ca3af' : '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: generating ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {generating ? '⏳ Generando...' : '🚀 Genera Contratto'}
            </button>
            
            <button
              onClick={() => {
                onSave({
                  ...formData,
                  propertyTitle: selectedProperty?.title,
                  contactName: selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : '',
                  agentName: selectedAgent?.name || 'N/A'
                })
                onClose()
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              ✓ Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


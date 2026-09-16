import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Order = {
  id: number
  order_ref: string
  customer_email: string
  full_name: string
  city: string
  status: string
  created_at: string
  total_amount: number
}

type OrderItem = {
  sku: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

type OrderDetail = Order & {
  items: OrderItem[]
}

type FormItem = {
  sku: string
  quantity: number
}

const API_URL = 'http://localhost:4000'

const statusOptions = ['all', 'pending', 'paid', 'shipped', 'cancelled']

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value)

const formatDate = (value: string) =>
  new Date(value).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

function App() {
  const [orders, setOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [limit] = useState(5)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [totalPages, setTotalPages] = useState(1)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({
    customer_email: '',
    items: [{ sku: '', quantity: 1 }] as FormItem[],
  })

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`${API_URL}/orders?${params.toString()}`)
      const data = await response.json()

      setOrders(data.data ?? [])
      setTotalPages(data.pages ?? 1)
      if (!selectedOrderId && (data.data ?? []).length > 0) {
        setSelectedOrderId(data.data[0].id)
      }
    } catch (error) {
      console.error('GET /orders failed', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDetail = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/orders/${id}`)
      const data = await response.json()
      setDetail(data)
    } catch (error) {
      console.error('GET /orders/:id failed', error)
    }
  }

  useEffect(() => {
    void fetchOrders()
  }, [page, status, limit])

  useEffect(() => {
    if (selectedOrderId) {
      void fetchDetail(selectedOrderId)
    }
  }, [selectedOrderId])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return orders

    return orders.filter((order) =>
      order.customer_email.toLowerCase().includes(keyword) ||
      order.full_name.toLowerCase().includes(keyword) ||
      order.order_ref.toLowerCase().includes(keyword),
    )
  }, [orders, search])

  const addItem = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, { sku: '', quantity: 1 }],
    }))
  }

  const updateItem = (index: number, field: 'sku' | 'quantity', value: string | number) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  const removeItem = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault()

    const payloadItems = form.items
      .filter((item) => item.sku.trim())
      .map((item) => ({
        sku: item.sku.trim(),
        quantity: Number(item.quantity),
      }))

    if (!form.customer_email.trim() || payloadItems.length === 0) {
      setMessage('Debes ingresar un cliente y al menos un producto.')
      return
    }

    try {
      setCreating(true)
      const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: form.customer_email.trim(),
          items: payloadItems,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'No se pudo crear la orden.')
      }

      setMessage(`Pedido creado: ${data.order_ref}`)
      setForm({ customer_email: '', items: [{ sku: '', quantity: 1 }] })
      setPage(1)
      setStatus('all')
      await fetchOrders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error inesperado')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Pedidos</p>
          <h1>Panel de gestión</h1>
        </div>
      </header>

      <section className="toolbar panel">
        <label className="field compact">
          <span>Buscar</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cliente o referencia"
          />
        </label>

        <label className="field compact">
          <span>Estado</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'Todos' : option}
              </option>
            ))}
          </select>
        </label>

        <div className="pager">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
            Anterior
          </button>
          <span>
            Página {page} / {totalPages}
          </span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
            Siguiente
          </button>
        </div>
      </section>

      <div className="layout">
        <section className="panel list-panel">
          {loading ? (
            <p className="empty-state">Cargando pedidos…</p>
          ) : filteredOrders.length === 0 ? (
            <p className="empty-state">No hay pedidos para mostrar.</p>
          ) : (
            filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`order-card ${selectedOrderId === order.id ? 'selected' : ''}`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <div className="row between">
                  <strong>{order.order_ref}</strong>
                  <span className={`status-badge ${order.status}`}>{order.status}</span>
                </div>
                <div className="row between muted">
                  <span>{order.full_name}</span>
                  <span>{order.city}</span>
                </div>
                <div className="row between muted">
                  <span>{order.customer_email}</span>
                  <strong>{formatMoney(order.total_amount)}</strong>
                </div>
              </button>
            ))
          )}
        </section>

        <section className="panel detail-panel">
          {detail ? (
            <>
              <div className="row between detail-header">
                <div>
                  <p className="eyebrow">Detalle</p>
                  <h2>{detail.order_ref}</h2>
                </div>
                <span className={`status-badge ${detail.status}`}>{detail.status}</span>
              </div>

              <dl className="meta-grid">
                <div>
                  <dt>Cliente</dt>
                  <dd>{detail.full_name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{detail.customer_email}</dd>
                </div>
                <div>
                  <dt>Ciudad</dt>
                  <dd>{detail.city}</dd>
                </div>
                <div>
                  <dt>Creación</dt>
                  <dd>{formatDate(detail.created_at)}</dd>
                </div>
              </dl>

              <div className="items-table">
                <div className="items-head">
                  <span>Producto</span>
                  <span>Cant.</span>
                  <span>Precio</span>
                  <span>Subtotal</span>
                </div>

                {detail.items.map((item) => (
                  <div key={`${detail.order_ref}-${item.sku}`} className="items-row">
                    <span>{item.product_name}</span>
                    <span>{item.quantity}</span>
                    <span>{formatMoney(item.unit_price)}</span>
                    <span>{formatMoney(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-state">Selecciona una orden para ver el detalle.</p>
          )}
        </section>

        <section className="panel form-panel">
          <h2>Crear orden</h2>

          <form onSubmit={handleCreateOrder} className="order-form">
            <label className="field">
              <span>Cliente</span>
              <input
                type="email"
                value={form.customer_email}
                onChange={(event) => setForm((current) => ({ ...current, customer_email: event.target.value }))}
                placeholder="cliente@correo.com"
              />
            </label>

            <div className="items-editor">
              {form.items.map((item, index) => (
                <div key={`${index}-${item.sku}`} className="item-row">
                  <label className="field">
                    <span>SKU</span>
                    <input
                      value={item.sku}
                      onChange={(event) => updateItem(index, 'sku', event.target.value)}
                      placeholder="SKU-123"
                    />
                  </label>

                  <label className="field small">
                    <span>Cant.</span>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateItem(index, 'quantity', Number(event.target.value) || 1)}
                    />
                  </label>

                  {form.items.length > 1 && (
                    <button type="button" className="remove-btn" onClick={() => removeItem(index)}>
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={addItem}>
                Agregar item
              </button>
              <button type="submit" disabled={creating}>
                {creating ? 'Creando...' : 'Crear orden'}
              </button>
            </div>

            {message && <p className="message">{message}</p>}
          </form>
        </section>
      </div>
    </div>
  )
}

export default App

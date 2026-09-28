-- ft_blueprint for Neovim (M6): your buffers, as you type, in the ft_blueprint
-- view next to nvim. The page doesn't care where an edit comes from; this
-- plugin just pushes each C buffer's text and your cursor to the local
-- ft_blueprint server, and moves your cursor when you double-click code on
-- the grid. It never writes files: saving stays :w.
--
--   :FtbConnect [port|url]   start (default http://localhost:5173)
--   :FtbOpen [dir]           open this project in the page (default: the
--                            folder with a Makefile or .git above this file)
--   :FtbDisconnect           stop
--
-- Needs curl and Neovim 0.10+.
local M = {}

local cfg = { url = 'http://localhost:5173', debounce = 120, source = 'nvim' }
local enabled = false
local stream = nil -- the curl process holding /api/live/stream open
local retry = 1000
local pending = {} -- bufnr → true (send text) / false (cursor only)
local sent = {} -- bufnr → the text the server has
local timer = nil
local group = vim.api.nvim_create_augroup('FtBlueprint', { clear = true })

local MAKEFILES = { Makefile = true, makefile = true, GNUmakefile = true }

local function wanted(buf)
  if not vim.api.nvim_buf_is_valid(buf) or vim.bo[buf].buftype ~= '' then return false end
  local name = vim.api.nvim_buf_get_name(buf)
  if name == '' then return false end
  return name:match('%.[ch]$') ~= nil or MAKEFILES[vim.fn.fnamemodify(name, ':t')] == true
end

local function post(body)
  vim.system({
    'curl', '-sS', '-m', '5', '-X', 'POST',
    '-H', 'content-type: application/json', '-H', 'x-ftb: 1',
    '--data-binary', '@-', cfg.url .. '/api/live/push',
  }, { stdin = vim.json.encode(body), text = true }, function() end)
end

local function path_of(buf)
  return vim.fn.fnamemodify(vim.api.nvim_buf_get_name(buf), ':p')
end

-- The buffer as it would be on disk right now.
local function text_of(buf)
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  return table.concat(lines, '\n') .. (vim.bo[buf].eol and '\n' or '')
end

local function push(buf, with_text)
  if not wanted(buf) then return end
  local body = { source = cfg.source, kind = 'edit', path = path_of(buf) }
  if with_text then
    local text = text_of(buf)
    if sent[buf] ~= text then
      body.text = text
      sent[buf] = text
    end
  end
  if buf == vim.api.nvim_get_current_buf() then
    local c = vim.api.nvim_win_get_cursor(0)
    body.line, body.col = c[1] - 1, c[2]
  end
  if body.text or body.line then post(body) end
end

local function flush()
  local list = pending
  pending = {}
  for buf, with_text in pairs(list) do push(buf, with_text) end
end

local function schedule(buf, with_text)
  if not enabled or not wanted(buf) then return end
  pending[buf] = pending[buf] or with_text
  timer = timer or vim.uv.new_timer()
  timer:stop()
  timer:start(cfg.debounce, 0, vim.schedule_wrap(flush))
end

local function push_all()
  sent = {}
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buf) and wanted(buf) then push(buf, true) end
  end
end

-- Double-click on the grid: go to that place.
local function reveal(msg)
  if type(msg.path) ~= 'string' then return end
  local cur = path_of(vim.api.nvim_get_current_buf())
  if cur ~= msg.path then
    local ok = pcall(vim.cmd.drop, vim.fn.fnameescape(msg.path))
    if not ok then vim.cmd.split(vim.fn.fnameescape(msg.path)) end
  end
  local line = math.min((msg.line or 0) + 1, vim.api.nvim_buf_line_count(0))
  pcall(vim.api.nvim_win_set_cursor, 0, { line, msg.col or 0 })
  vim.cmd('normal! zz')
end

local function start_stream()
  if stream or not enabled then return end
  local buf = ''
  stream = vim.system({
    'curl', '-sSN', '-X', 'POST', '-H', 'content-type: application/json', '-H', 'x-ftb: 1',
    '-d', vim.json.encode({ role = 'editor', source = cfg.source }), cfg.url .. '/api/live/stream',
  }, {
    text = true,
    stdout = function(_, data)
      if not data then return end
      buf = buf .. data
      while true do
        local i = buf:find('\n', 1, true)
        if not i then break end
        local line = buf:sub(1, i - 1)
        buf = buf:sub(i + 1)
        local ok, msg = pcall(vim.json.decode, line)
        if ok and type(msg) == 'table' then
          if msg.k == 'hello' then
            retry = 1000
            vim.schedule(function()
              push_all()
              vim.notify('ft_blueprint: live at ' .. cfg.url, vim.log.levels.INFO)
            end)
          elseif msg.k == 'reveal' then
            vim.schedule(function() reveal(msg) end)
          end
        end
      end
    end,
  }, function()
    vim.schedule(function()
      stream = nil
      if not enabled then return end
      -- the server went away: try again, less often each time
      vim.defer_fn(start_stream, retry)
      retry = math.min(retry * 2, 30000)
    end)
  end)
end

local function autocmds()
  vim.api.nvim_clear_autocmds({ group = group })
  vim.api.nvim_create_autocmd({ 'TextChanged', 'TextChangedI', 'TextChangedP', 'BufEnter', 'BufWritePost' }, {
    group = group,
    callback = function(a) schedule(a.buf, true) end,
  })
  vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
    group = group,
    callback = function(a) schedule(a.buf, false) end,
  })
  vim.api.nvim_create_autocmd({ 'BufDelete', 'BufWipeout' }, {
    group = group,
    callback = function(a)
      if sent[a.buf] and wanted(a.buf) then post({ source = cfg.source, kind = 'close', path = path_of(a.buf) }) end
      sent[a.buf] = nil
    end,
  })
  vim.api.nvim_create_autocmd('VimLeavePre', { group = group, callback = function() M.disconnect() end })
end

local function url_of(arg)
  if not arg or arg == '' then return nil end
  if arg:match('^%d+$') then return 'http://localhost:' .. arg end
  return (arg:gsub('/+$', ''))
end

function M.connect(arg)
  cfg.url = url_of(arg) or cfg.url
  if not cfg.url:match('^https?://localhost[:/]') and not cfg.url:match('^https?://127%.0%.0%.1[:/]') and not cfg.url:match('^https?://localhost$') then
    return vim.notify('ft_blueprint: only a local server (localhost / 127.0.0.1)', vim.log.levels.ERROR)
  end
  if vim.fn.executable('curl') ~= 1 then return vim.notify('ft_blueprint: needs curl', vim.log.levels.ERROR) end
  if stream then M.disconnect() end
  enabled = true
  retry = 1000
  autocmds()
  start_stream()
end

function M.disconnect()
  enabled = false
  vim.api.nvim_clear_autocmds({ group = group })
  if stream then
    stream:kill(15)
    stream = nil
  end
  sent = {}
end

function M.open(dir)
  if not enabled then M.connect() end
  dir = dir and dir ~= '' and vim.fn.fnamemodify(dir, ':p') or nil
  if not dir then
    local here = vim.api.nvim_buf_get_name(0)
    dir = (here ~= '' and vim.fs.root(here, { 'Makefile', '.git' })) or vim.fn.getcwd()
  end
  post({ source = cfg.source, kind = 'open', path = (dir:gsub('/+$', '')) })
end

function M.setup(opts)
  opts = opts or {}
  if opts.port then cfg.url = 'http://localhost:' .. opts.port end
  if opts.url then cfg.url = url_of(opts.url) end
  if opts.debounce then cfg.debounce = opts.debounce end
  if opts.auto then M.connect() end
end

return M

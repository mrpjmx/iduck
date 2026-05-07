/**
 * Decap CMS R2 图片上传 Widget
 * 通过 Netlify Functions 上传到 Cloudflare R2
 */

(function() {
  'use strict';

  // Netlify Function URL
  const UPLOAD_URL = '/.netlify/functions/upload-image';

  // 创建上传控件
  const R2ImageControl = window.createClass({
    getInitialState: function() {
      return {
        uploading: false,
        preview: this.props.value || '',
        error: null
      };
    },

    handleFileChange: async function(e) {
      const file = e.target.files[0];
      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        this.setState({ error: '请选择图片文件' });
        return;
      }

      // 验证文件大小 (最大 10MB)
      if (file.size > 10 * 1024 * 1024) {
        this.setState({ error: '图片大小不能超过 10MB' });
        return;
      }

      this.setState({ uploading: true, error: null });

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(UPLOAD_URL, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          this.setState({ 
            preview: result.url,
            uploading: false 
          });
          this.props.onChange(result.url);
        } else {
          this.setState({ 
            error: result.error || '上传失败',
            uploading: false 
          });
        }
      } catch (err) {
        this.setState({ 
          error: '网络错误: ' + err.message,
          uploading: false 
        });
      }
    },

    handleUrlChange: function(e) {
      const url = e.target.value;
      this.setState({ preview: url });
      this.props.onChange(url);
    },

    handleRemove: function() {
      this.setState({ preview: '' });
      this.props.onChange('');
    },

    render: function() {
      const h = window.h;
      const state = this.state;

      return h('div', { className: 'r2-image-widget', style: { padding: '10px 0' } },
        // 预览区域
        state.preview && h('div', { 
          style: { 
            marginBottom: '10px',
            position: 'relative',
            display: 'inline-block'
          } 
        },
          h('img', { 
            src: state.preview, 
            style: { 
              maxWidth: '100%', 
              maxHeight: '200px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            } 
          }),
          h('button', {
            type: 'button',
            onClick: this.handleRemove,
            style: {
              position: 'absolute',
              top: '5px',
              right: '5px',
              background: 'rgba(0,0,0,0.6)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              cursor: 'pointer',
              fontSize: '14px'
            }
          }, '×')
        ),

        // 上传区域
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
          h('label', { 
            style: {
              padding: '8px 16px',
              background: state.uploading ? '#94a3b8' : '#3b82f6',
              color: 'white',
              borderRadius: '4px',
              cursor: state.uploading ? 'wait' : 'pointer',
              display: 'inline-block',
              fontSize: '14px'
            }
          },
            state.uploading ? '上传中...' : '📤 上传到 R2',
            h('input', {
              type: 'file',
              accept: 'image/*',
              onChange: this.handleFileChange,
              style: { display: 'none' },
              disabled: state.uploading
            })
          ),

          h('span', { style: { color: '#666', fontSize: '14px' } }, '或直接输入 URL')
        ),

        // URL 输入框
        h('input', {
          type: 'text',
          value: state.preview,
          onChange: this.handleUrlChange,
          placeholder: 'https://img.brochuan.com/xxx.jpg',
          style: {
            width: '100%',
            padding: '8px 12px',
            marginTop: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box'
          }
        }),

        // 错误提示
        state.error && h('div', { 
          style: { 
            color: '#ef4444', 
            marginTop: '8px',
            fontSize: '14px',
            padding: '8px',
            background: '#fef2f2',
            borderRadius: '4px'
          } 
        }, '❌ ' + state.error)
      );
    }
  });

  // 预览组件
  const R2ImagePreview = window.createClass({
    render: function() {
      const h = window.h;
      const value = this.props.value;
      
      if (!value) {
        return h('div', { style: { color: '#999', padding: '10px' } }, '暂无图片');
      }

      return h('div', { style: { padding: '5px' } },
        h('img', {
          src: value,
          style: {
            maxWidth: '100%',
            maxHeight: '150px',
            borderRadius: '4px'
          }
        })
      );
    }
  });

  // 注册 Widget
  if (window.CMS) {
    window.CMS.registerWidget('r2-image', R2ImageControl, R2ImagePreview);
    console.log('✅ R2 Image Widget registered');
  } else {
    console.warn('⚠️ CMS not loaded yet');
  }
})();
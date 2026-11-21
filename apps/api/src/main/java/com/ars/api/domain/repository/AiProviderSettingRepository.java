package com.ars.api.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.AiProviderSetting;

public interface AiProviderSettingRepository extends JpaRepository<AiProviderSetting, Long> {
}

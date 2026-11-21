package com.ars.api.dto;

public record SessionResponse(SessionUserResponse user) {

    public static SessionResponse anonymous() {
        return new SessionResponse(null);
    }
}
